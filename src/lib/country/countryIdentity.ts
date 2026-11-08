/**
 * What a country is CALLED and shown as, once runtime events are taken into
 * account.
 *
 * Compiled seed data (name, flag, government-type label) does not reflect
 * runtime conversions; getCountryConfig only layers era overrides and never
 * reads countryState. COUNTRY_CONFIGS.name is depended on by many synchronous
 * call sites, so this resolver is the single display layer that answers
 * "given what has happened, what should a reader be told?" without drift.
 */
import type { Db } from "mongodb";
import {
  COUNTRY_CONFIGS,
  getCountryConfig,
  getCountryDisplayName,
  type CountryId,
  type GovernmentType,
} from "@/lib/constants/countries";
import { getCountryState, primeCountryStates } from "@/lib/countryState";

/** Everything a header, card or listing needs to name a country correctly. */
export interface CountryIdentity {
  name: string;
  flagEmoji: string;
  /** The live system of government, which may differ from the compiled one. */
  governmentType: GovernmentType;
  /** Its player-facing label, agreeing with `governmentType`. */
  governmentTypeLabel: string;
}

/**
 * Title-case names for the systems, for the `governmentTypeLabel` slot.
 *
 * Deliberately separate from `GOVERNMENT_SYSTEM_LABELS` in `peaceTerm`, which is
 * lower-case prose for mid-sentence use ("becomes a one-party state"). These are
 * labels; that is a clause. Merging them would force one register to read wrong.
 */
const GOVERNMENT_TYPE_TITLES: Record<GovernmentType, string> = {
  presidential: "Presidential Republic",
  parliamentaryRepublic: "Parliamentary Republic",
  parliamentaryMonarchy: "Parliamentary Monarchy",
  onePartyState: "One Party State",
};

/**
 * The label for a country whose system may have changed under it.
 *
 * When runtime and compiled agree, the COMPILED label wins — it carries nuance a
 * type cannot ("Semi-Presidential Republic" for France, whose `governmentType` is
 * just `presidential`). When they disagree, the compiled label is describing a
 * system the country no longer has, so the runtime type is named instead.
 */
export function governmentTypeLabelFor(
  countryId: CountryId,
  runtimeType: GovernmentType,
  preset?: string
): string {
  const config = Object.hasOwn(COUNTRY_CONFIGS, countryId)
    ? getCountryConfig(countryId, preset)
    : undefined;
  if (config && config.governmentType === runtimeType) return config.governmentTypeLabel;
  return GOVERNMENT_TYPE_TITLES[runtimeType] ?? config?.governmentTypeLabel ?? runtimeType;
}

/**
 * Resolve one country's presentation, runtime state included.
 *
 * Server-side, because it reads `countryState`. Client components take the result
 * as props rather than calling this, which is also what keeps the database out of
 * the browser bundle.
 */
export async function resolveCountryIdentity(
  db: Db,
  countryId: CountryId,
  preset?: string
): Promise<CountryIdentity> {
  const config = Object.hasOwn(COUNTRY_CONFIGS, countryId)
    ? getCountryConfig(countryId, preset)
    : undefined;
  const runtime = await getCountryState(db, countryId);
  const governmentType =
    runtime.governmentType ?? config?.governmentType ?? "parliamentaryRepublic";

  return {
    name: runtime.displayNameOverride ?? getCountryDisplayName(countryId, preset),
    flagEmoji: runtime.flagEmojiOverride ?? config?.flagEmoji ?? "",
    governmentType,
    governmentTypeLabel: governmentTypeLabelFor(countryId, governmentType, preset),
  };
}

export interface CountryPresentationOverride {
  name?: string;
  flagEmoji?: string;
}

/**
 * Read-only presentation overrides for the whole world, in one read.
 *
 * `resolveCountryIdentities` is richer but goes through `getCountryState`,
 * which SELF-HEALS a missing row by writing. Wrong on a hot public listing
 * endpoint that must not insert documents as a side effect. Fails soft for
 * the same reason its sibling does: compiled name beats a 500.
 *
 * Name and flag travel together because a settlement writes both when it
 * renames the survivor; applying one without the other mislabels the result.
 */
export async function loadCountryPresentationOverrides(
  db: Db
): Promise<Partial<Record<CountryId, CountryPresentationOverride>>> {
  try {
    const rows = await db
      .collection<{
        _id: CountryId;
        displayNameOverride?: string | null;
        flagEmojiOverride?: string | null;
      }>("countryState")
      .find(
        {
          $or: [
            { displayNameOverride: { $type: "string", $ne: "" } },
            { flagEmojiOverride: { $type: "string", $ne: "" } },
          ],
        },
        { projection: { displayNameOverride: 1, flagEmojiOverride: 1 } }
      )
      .toArray();
    const out: Partial<Record<CountryId, CountryPresentationOverride>> = {};
    for (const row of rows) {
      const entry: CountryPresentationOverride = {};
      if (typeof row.displayNameOverride === "string" && row.displayNameOverride.length > 0) {
        entry.name = row.displayNameOverride;
      }
      if (typeof row.flagEmojiOverride === "string" && row.flagEmojiOverride.length > 0) {
        entry.flagEmoji = row.flagEmojiOverride;
      }
      if (entry.name || entry.flagEmoji) out[row._id] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Every runtime display-name override in the world, for hydrating the client.
 *
 * Client surfaces cannot call the server-only resolver, so overrides ride into
 * the tree and useCountryDisplayName applies them. Root layout runs per request,
 * so one read covers the world.
 *
 * Only non-empty strings count: a null or "" override means "no override" and
 * must fall through to the compiled name rather than blanking the country.
 */
export async function loadCountryNameOverrides(
  db: Db
): Promise<Partial<Record<CountryId, string>>> {
  // FAILS SOFT, deliberately. Callers are page renders; the worst case of an
  // empty map is a country shown under its compiled name. A 500 from a cosmetic
  // lookup would be worse, and MockDbs in page tests rely on this guard.
  try {
    const rows = await db
      .collection<{ _id: CountryId; displayNameOverride?: string | null }>("countryState")
      .find(
        { displayNameOverride: { $type: "string", $ne: "" } },
        { projection: { displayNameOverride: 1 } }
      )
      .toArray();
    const out: Partial<Record<CountryId, string>> = {};
    for (const row of rows) {
      if (typeof row.displayNameOverride === "string" && row.displayNameOverride.length > 0) {
        out[row._id] = row.displayNameOverride;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The same for several countries at once, for listings.
 *
 * PRIMED FIRST, deliberately. `getCountryState` memoises per Db instance and
 * `MongoClient.db()` hands back a new instance every call, so that memo is cold
 * at the top of every request: resolving the whole world one at a time is eighty
 * sequential round trips on a public endpoint. One `$in` read up front turns the
 * loop below into cache hits.
 */
export async function resolveCountryIdentities(
  db: Db,
  countryIds: CountryId[],
  preset?: string
): Promise<Map<CountryId, CountryIdentity>> {
  await primeCountryStates(db, countryIds);
  const out = new Map<CountryId, CountryIdentity>();
  for (const id of countryIds) {
    out.set(id, await resolveCountryIdentity(db, id, preset));
  }
  return out;
}
