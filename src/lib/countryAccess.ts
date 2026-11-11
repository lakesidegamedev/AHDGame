/**
 * Country access control utilities.
 *
 * Resolves access in two tiers: DB documents in `countryGameStates` override
 * static `COUNTRY_CONFIGS` defaults. Fields fall back independently, so an
 * admin can override just `status` or just `enabledForPlayers`. The collection
 * is lazy; a missing document falls back to the config's `status` ("active" =
 * enabled, anything else disabled).
 *
 * Every registered country that is not `enabledForPlayers` is browsable
 * read-only, including political pages; per-action APIs still require
 * citizenship/office. Only unregistered countries stay fully hidden.
 *
 * `economyPreview` no longer gates routes; it wires a country's economy into
 * cross-country market lists via `getEconomyVisibleCountryIds`.
 */

import { AsyncLocalStorage } from "async_hooks";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  COUNTRY_CONFIGS,
  COUNTRY_ORDER,
  type CountryId,
  type CountryStatus,
} from "@/lib/constants/countries";
import type { CountryGameState, GameState } from "@/lib/db/types/gameState";
import {
  countryRequirementLevelForAccess,
  type CountryRequirementLevel,
} from "@/lib/world/countryRequirementLevel";
import { NPP_AUTONOMY_LEVEL_RANK } from "@/lib/nppAutonomy/levels";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";

export interface CountryAccess {
  enabledForPlayers: boolean;
  status: CountryStatus;
  /** The feature-completeness contract this runtime access state must satisfy. */
  requirementLevel: CountryRequirementLevel;
  /**
   * True when this country's economy is wired into the cross-country market
   * lists (stock exchange, commodities, bonds) for non-admin players. This is
   * NOT a route gate — see `registered` for what a player may browse.
   */
  economyPreview: boolean;
  /**
   * True when the country exists in the runtime registered set (`COUNTRY_ORDER`
   * plus any latent country activated via a `status: "active"` row). An
   * unregistered country has no seeded world to show and stays hidden.
   */
  registered: boolean;
  /**
   * True when a registered country is browsable but not playable: every page
   * renders read-only, and the per-action APIs still refuse the viewer because
   * they require citizenship or office. Exactly `registered && !enabledForPlayers`.
   */
  econOnly: boolean;
  /**
   * True when this non-player country is run by the NPP autonomy governing brain
   * (global autonomy level ≥ v1). Its political pages — legislature, parties,
   * state/region politics, cabinet — then have a real (NPP-staffed) government to
   * show, so they are surfaced to players **read-only** (actions stay blocked by
   * the per-action APIs, which require citizenship/office). Always false for
   * player-enabled countries.
   */
  nppGoverned: boolean;
}

/**
 * Read the global NPP-autonomy level directly off `gameState` (mirrors
 * `getNppAutonomyLevel`). Inlined here rather than imported from
 * `nppAutonomy/featureFlag` to avoid an import cycle — that module imports
 * `isCountryEnabledForPlayers` from this one. The rank map comes from the
 * dependency-free `levels` module so it can never fall behind a new tier.
 */
async function readGlobalNppLevelRank(db: Db): Promise<number> {
  const doc = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { nppAutonomyLevel: 1, nppAutonomyEnabled: 1 } }
  );
  const level = doc?.nppAutonomyLevel ?? (doc?.nppAutonomyEnabled === true ? "v0" : "off");
  return NPP_AUTONOMY_LEVEL_RANK[level] ?? 0;
}

/**
 * Resolve access settings for a single country.
 *
 * Per-field fallback: DB values win when present; missing fields fall back to
 * config. `enabledForPlayers` is derived from `resolvedStatus` (not raw config
 * status) so that a DB-set status of "coming-soon" correctly disables access
 * even when `enabledForPlayers` is absent from the document.
 */
export async function getCountryAccess(countryId: CountryId): Promise<CountryAccess> {
  const db = await getDb();
  return getCountryAccessFromDb(db, countryId);
}

/**
 * Boolean shortcut around `getCountryAccessFromDb`. Phase 10 allowlist gates
 * call this from player-facing layouts, admin tools, and API routes. The admin
 * panel writes `countryGameStates` rows; this reads them so a flip activates a
 * country with no redeploy.
 */
export async function isCountryEnabledForPlayers(db: Db, countryId: CountryId): Promise<boolean> {
  const access = await getCountryAccessFromDb(db, countryId);
  return access.enabledForPlayers;
}

/**
 * Dynamically-scoped snapshot of every country's access record.
 *
 * ⚠️ AsyncLocalStorage, NOT a module-level cache. A module cache would outlive
 * the scope that filled it and serve a stale status after an admin flipped a
 * country live — and the reset WRITES `countryGameStates` (seedCountryGameStates)
 * partway through its own run. Here the store exists only for the dynamic extent
 * of one callback and cannot leak.
 *
 * ⚠️ Only valid where nothing in `fn` writes `countryGameStates`. The election
 * battery and founding sweep satisfy that: they are read-only with respect to it,
 * and the seeder that writes it runs long before either.
 */
const countryAccessSnapshot = new AsyncLocalStorage<Record<CountryId, CountryAccess>>();

/**
 * Read every country's access ONCE and serve it to all `getCountryAccessFromDb`
 * calls inside `fn`, instead of one findOne per country per caller.
 */
export async function withCountryAccessSnapshot<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return countryAccessSnapshot.run(await getAllCountryAccess(db), fn);
}

/**
 * `Db`-injecting variant of `getCountryAccess`. Use from contexts that already
 * hold a `Db` reference (per-turn processors, evaluators) so we don't ping the
 * mongodb singleton's promise unnecessarily.
 */
export async function getCountryAccessFromDb(db: Db, countryId: CountryId): Promise<CountryAccess> {
  const config = COUNTRY_CONFIGS[countryId];
  if (!config) throw new Error(`Invalid country ID: ${countryId}`);

  // Served from the ambient snapshot when one is open — see
  // {@link withCountryAccessSnapshot}. Falls through to the per-country read
  // when there is no scope, or when the snapshot does not carry this country
  // (`getAllCountryAccess` only yields REGISTERED ones).
  const snapshot = countryAccessSnapshot.getStore();
  const cached = snapshot?.[countryId];
  if (cached) return cached;

  const doc = await countryGameStatesCollection(db)
    .findOne({ _id: countryId });

  // A DISSOLVED country is out of the registry, matching `registeredBase()` for
  // list paths. Otherwise the single-country path contradicts them: a merged
  // country's page stays browsable "econ-only", its election gates read it as
  // NPP-governed, and per-country processing keeps simulating a dead state.
  //
  // An era-ABSENT country is unregistered for the same reason and takes the
  // same branch. The causes stay distinct in the data (see `absentInEra`) to
  // preserve merge idempotency, but produce the identical access answer.
  if (doc?.dissolvedTurn != null || doc?.absentInEra === true) {
    return {
      enabledForPlayers: false,
      // `dissolvedTurn` is deliberately NOT a `CountryStatus` member (see the
      // field's doc in gameState.ts) — "coming-soon" is the nearest existing
      // value that reads as fully unavailable, and `registered: false` is the
      // load-bearing answer here.
      status: "coming-soon",
      economyPreview: false,
      requirementLevel: "background",
      registered: false,
      econOnly: false,
      nppGoverned: false,
    };
  }

  // Resolve status first so the enabledForPlayers fallback uses the DB-driven value.
  const resolvedStatus = doc?.status ?? config.status;
  const enabledForPlayers = doc?.enabledForPlayers ?? resolvedStatus === "active";
  const economyPreview = !enabledForPlayers && (doc?.economyPreview ?? false);

  // A non-player country is "NPP-governed" once the global autonomy level is v1+.
  const nppGoverned =
    !enabledForPlayers && (await readGlobalNppLevelRank(db)) >= NPP_AUTONOMY_LEVEL_RANK.v1;

  // Mirrors `registeredBase()`: the static base, plus a latent country whose
  // activation flipped its row to "active".
  const registered = COUNTRY_ORDER.includes(countryId) || resolvedStatus === "active";

  return {
    enabledForPlayers,
    status: resolvedStatus,
    // economyPreview is only meaningful when the country isn't fully enabled.
    // If fully enabled, treat as false (no partial-access banner needed).
    economyPreview,
    requirementLevel: countryRequirementLevelForAccess({ enabledForPlayers, economyPreview }),
    registered,
    econOnly: registered && !enabledForPlayers,
    nppGoverned,
  };
}

/**
 * The registered-country base for the access resolvers: `COUNTRY_ORDER` plus any
 * `countryGameStates` doc flipped to `status: "active"` that isn't already in the
 * static base — i.e. a seceded latent country (SCO/WAL). De-duped, base-first.
 * Behavior for the existing 8 countries is identical (no active extra ⇒ exactly
 * `COUNTRY_ORDER`), so this is what makes activation surface a country at runtime.
 */
function registeredBase(docs: CountryGameState[]): CountryId[] {
  const activeExtra = docs
    .filter(
      (d) =>
        (d.status === "active" || d.status === "beta") &&
        !COUNTRY_ORDER.includes(d._id as CountryId)
    )
    .map((d) => d._id as CountryId)
    .sort();
  // A dissolved country is filtered out of the BASE, which is what lets a
  // country compiled into COUNTRY_ORDER actually be retired. Everything
  // downstream — the player list, the economy list, the simulated list — is
  // derived from this, so one filter retires it everywhere at once.
  const dissolved = new Set(docs.filter((d) => d.dissolvedTurn != null).map((d) => String(d._id)));
  // Era absence is a SEPARATE exclusion from dissolution, deliberately kept in
  // its own clause: a country absent from this era was never absorbed, and
  // conflating the two would break merge idempotency (see CountryGameState).
  // Undefined reads as registered, so rows predating the field are unaffected.
  const absent = new Set(docs.filter((d) => d.absentInEra === true).map((d) => String(d._id)));
  return [...COUNTRY_ORDER, ...activeExtra].filter((id) => !dissolved.has(id) && !absent.has(id));
}

/**
 * Resolve access settings for all countries in a single Mongo round-trip.
 *
 * Use this on landing/index pages (e.g. /world) instead of mapping
 * `getCountryAccess` over every country — that pattern fan-outs to N findOne
 * calls per request and surfaces as an N+1 query in performance tracing.
 */
export async function getAllCountryAccess(dbArg?: Db): Promise<Record<CountryId, CountryAccess>> {
  const db = dbArg ?? (await getDb());
  const docs = await countryGameStatesCollection(db).find({}).toArray();
  const docMap = new Map(docs.map((d) => [d._id, d]));
  const globalNppRank = await readGlobalNppLevelRank(db);

  const out = {} as Record<CountryId, CountryAccess>;
  for (const countryId of registeredBase(docs)) {
    const config = COUNTRY_CONFIGS[countryId];
    const doc = docMap.get(countryId);
    const resolvedStatus = doc?.status ?? config.status;
    const enabledForPlayers = doc?.enabledForPlayers ?? resolvedStatus === "active";
    const economyPreview = !enabledForPlayers && (doc?.economyPreview ?? false);
    out[countryId] = {
      enabledForPlayers,
      status: resolvedStatus,
      economyPreview,
      requirementLevel: countryRequirementLevelForAccess({ enabledForPlayers, economyPreview }),
      // Everything `registeredBase()` yields is registered by construction.
      registered: true,
      econOnly: !enabledForPlayers,
      nppGoverned: !enabledForPlayers && globalNppRank >= NPP_AUTONOMY_LEVEL_RANK.v1,
    };
  }
  return out;
}

/**
 * Return all country IDs that are currently enabled for players.
 *
 * Uses a single `find()` to fetch all country documents and resolves each
 * against its config default — avoids N per-country queries.
 *
 * Note: economy-preview countries are NOT included here. Use
 * `getEconomyVisibleCountryIds()` when you need to include them.
 */
export async function getEnabledCountryIds(): Promise<CountryId[]> {
  const db = await getDb();
  return getEnabledCountryIdsFromDb(db);
}

/**
 * `Db`-injecting variant of `getEnabledCountryIds`. Use from per-turn
 * processors that already hold a `Db` reference (and need MockDb-injectable
 * enumeration). Resolves each country against its config default, so countries
 * that are active purely via `COUNTRY_CONFIGS` — including the US, which has no
 * `countryGameStates` document — are still returned.
 */
/**
 * Countries the ENGINE is simulating, as opposed to countries players may join.
 *
 * World-level subsystems (auto-disasters, auto-crises, IO broadcasts) must fire
 * in every simulated country, not just player-enterable ones, or a world with
 * no player-enabled countries silently produces zero events.
 *
 * Status is the runtime `countryGameStates.status` if present, else the
 * compiled-in config status. `enabledForPlayers: true` also qualifies a country
 * (a world with players must be simulated even if status was never flipped).
 */
export async function getSimulatedCountryIds(db: Db): Promise<CountryId[]> {
  const docs = await countryGameStatesCollection(db)
    .find({}, { projection: { _id: 1, status: 1, enabledForPlayers: 1, backgroundCountry: 1 } })
    .toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return registeredBase(docs).filter((countryId) => {
    const doc = byId.get(countryId);
    // A background country is registered but outside the full
    // simulation: no crises, disasters or health rows for it.
    if (doc?.backgroundCountry === true) return false;
    const resolved = doc?.status ?? COUNTRY_CONFIGS[countryId].status;
    // `enabledForPlayers: true` is how live worlds opened countries before the
    // status field was consistently set (config may still say "coming-soon").
    // A country with real players must stay simulated (crises/disasters), so
    // honor the override in addition to status — same contract as
    // getEnabledCountryIdsFromDb.
    return resolved === "active" || resolved === "beta" || doc?.enabledForPlayers === true;
  });
}

export async function getEnabledCountryIdsFromDb(db: Db): Promise<CountryId[]> {
  const docs = await countryGameStatesCollection(db).find({}).toArray();

  const docMap = new Map(docs.map((d) => [d._id, d]));

  return registeredBase(docs).filter((countryId) => {
    const doc = docMap.get(countryId);
    const config = COUNTRY_CONFIGS[countryId];
    const resolvedStatus = doc?.status ?? config.status;
    return doc?.enabledForPlayers ?? resolvedStatus === "active";
  });
}

/**
 * Return all country IDs visible to non-admin players — both fully enabled
 * countries and those in economy-preview mode.
 *
 * Use this when filtering economic data (stockmarket, corporations, bonds)
 * that should include economy-preview countries.
 */
export async function getEconomyVisibleCountryIds(): Promise<CountryId[]> {
  const db = await getDb();
  const docs = await countryGameStatesCollection(db).find({}).toArray();

  const docMap = new Map(docs.map((d) => [d._id, d]));

  return registeredBase(docs).filter((countryId) => {
    const doc = docMap.get(countryId);
    const config = COUNTRY_CONFIGS[countryId];
    const resolvedStatus = doc?.status ?? config.status;
    const enabled = doc?.enabledForPlayers ?? resolvedStatus === "active";
    const preview = !enabled && (doc?.economyPreview ?? false);
    return enabled || preview;
  });
}

/**
 * Check whether a specific country is accessible to the requesting user.
 *
 * Admins bypass the enabled check entirely — they can always access any
 * country regardless of its enabled state. This avoids a DB round-trip for
 * every admin page load.
 */
export async function isCountryAccessible(
  countryId: CountryId,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  const { enabledForPlayers } = await getCountryAccess(countryId);
  return enabledForPlayers;
}
