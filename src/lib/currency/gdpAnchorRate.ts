/**
 * ONE resolver for "how many ₳ is one unit of a country's stored GDP worth".
 *
 * `CountryConfig.usdExchangeRate` is NOT an FX quote: it converts `State.gdp`
 * and the national budget seed (authored in each era's seed-file unit) into
 * ₳. It equals FX only when the seed happens to be in true local currency
 * (JP 2019 agrees; UK 2019 seeds in dollars so 1.0 is correct, not 0.75; IT/JP/CN/NG
 * 1953 seeds in USD millions so their rate is 1.0).
 *
 * The `exchangeRates` collection is NOT a drop-in replacement; market FX here
 * would silently rescale every world's GDP. What was genuinely duplicated is
 * the ERA DIMENSION: callers must pass the active world preset so stored
 * local GDP is not scaled with another era's denomination basis. Without a
 * preset, the base config is used.
 *
 * @see src/lib/constants/countries.ts
 * @see src/lib/constants/sectorSeedEra.ts
 */

import { getAuditRequestContext } from "@/lib/observability/context";
import type { Db } from "mongodb";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { resolvePresetIdFromGameState } from "@/lib/world/countryReadinessContract";
import type { GameState } from "@/lib/db/types";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * ₳ per one unit of `countryId`'s stored GDP under `preset`.
 *
 * Returns 1 (anchor passthrough) for an unrecognized country or a non-positive
 * configured rate, so a stale/legacy `countryId` on one state document degrades
 * to "treat this GDP as already ₳-denominated" instead of producing 0 or NaN and
 * zeroing out a market. Callers that want to log the unrecognized id should
 * check `isKnownGdpAnchorCountry` first — this function stays silent because it
 * runs inside per-corp/per-sector turn loops.
 */
export function getGdpAnchorRate(countryId: CountryId, preset?: string): number {
  const rate = getCountryConfig(countryId, preset)?.usdExchangeRate;
  return typeof rate === "number" && rate > 0 ? rate : 1;
}

/** True when `countryId` has a `COUNTRY_CONFIGS` entry at all. */
export function isKnownGdpAnchorCountry(countryId: CountryId): boolean {
  return getCountryConfig(countryId) != null;
}

/**
 * A country's stored GDP (local-currency millions) expressed in ₳ millions.
 * The whole reason `loadUsdGdpByCountry` and friends exist.
 */
export function gdpToAnchor(localMillions: number, countryId: CountryId, preset?: string): number {
  return localMillions * getGdpAnchorRate(countryId, preset);
}

/**
 * Presets already read inside a running turn phase, keyed by its
 * `turn:<n>:<phase>` trace id, per database handle. The turn lock is held for
 * the whole phase, so a world reset cannot change the preset under it; a new
 * phase gets a new key. Kept to the last few phases so the map never grows.
 */
const phasePresets = new WeakMap<Db, Map<string, Promise<string>>>();
const PHASE_PRESET_ENTRIES = 8;

async function readWorldPreset(db: Db): Promise<string> {
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { preset: 1 } }
  );
  return resolvePresetIdFromGameState(gameState);
}

/**
 * The active world's reset preset, read from the `gameState` singleton.
 *
 * One projected read of one document. Deliberately NOT cached at module scope:
 * a stale process-level preset would survive a world reset into the next era,
 * exactly the class of bug this module exists to remove. Inside a turn phase
 * the read is shared for that phase only (banking alone asked for it about
 * 180 times a turn), because a reset cannot happen while the phase holds the
 * turn lock. Requests and anything outside a phase still read every time.
 *
 * Falls back to `2019-default` when the document or the field is missing, which
 * is the same fallback every seeder uses.
 */
export async function loadWorldPreset(db: Db): Promise<string> {
  const traceId = getAuditRequestContext()?.traceId;
  if (!traceId?.startsWith("turn:")) return readWorldPreset(db);
  let byPhase = phasePresets.get(db);
  if (!byPhase) phasePresets.set(db, (byPhase = new Map()));
  const cached = byPhase.get(traceId);
  if (cached) return cached;
  const read = readWorldPreset(db);
  byPhase.set(traceId, read);
  // A failed read is not remembered: the next caller in the phase retries.
  read.catch(() => {
    if (byPhase.get(traceId) === read) byPhase.delete(traceId);
  });
  while (byPhase.size > PHASE_PRESET_ENTRIES) byPhase.delete(byPhase.keys().next().value!);
  return read;
}

/**
 * The active world's era unit-basis scale (`getEraUnitScale(preset)`): the one
 * DB-side resolver command/route callers use when no turn `lookups` object is
 * in scope. Same no-cache reasoning as {@link loadWorldPreset}.
 */
export async function loadWorldEraUnitScale(db: Db): Promise<number> {
  return getEraUnitScale(await loadWorldPreset(db));
}

/** Bound resolver for a world: `loadWorldPreset` once, then reuse per country. */
export interface WorldGdpAnchorRates {
  preset: string;
  rateFor(countryId: CountryId): number;
  toAnchor(localMillions: number, countryId: CountryId): number;
}

/** `loadWorldPreset` + {@link getGdpAnchorRate} bound to it. */
export async function loadWorldGdpAnchorRates(db: Db): Promise<WorldGdpAnchorRates> {
  const preset = await loadWorldPreset(db);
  return {
    preset,
    rateFor: (countryId) => getGdpAnchorRate(countryId, preset),
    toAnchor: (localMillions, countryId) => gdpToAnchor(localMillions, countryId, preset),
  };
}
