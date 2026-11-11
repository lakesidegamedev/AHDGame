import type { Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { isShippingPreset, tierFor } from "@/lib/world/eraRoster";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * Country-keyed region collections a preset switch can strand.
 *
 * Only the US pack clears these on reset (`RESET_DROP_COLLECTIONS`); other
 * countries' seeders only upsert their own rows, so a country the new preset
 * does not seed keeps the outgoing world's rows. The reset's reference rebuild
 * empties several of these first, but listing them here also covers a
 * preserve-reference reset of another preset.
 */
export const ABSENT_COUNTRY_REGION_COLLECTIONS = [
  "states",
  "stateDemographics",
  "demographicDefaults",
  "statePartyOrg",
  "politicalMetrics",
  "macroMetrics",
  "federalBudget",
  "stateBudgets",
  "stateResourceCapacity",
  "congressionalDistricts",
  "stateSectorSpecializations",
  "stateDemographicTurnout",
  "stateRegistrationPool",
  "regionDemographics",
  "stateMetrics",
  "strategicSectorDesignations",
  "politicalParties",
  "partyBudget",
  "partyCharters",
] as const;

/** Countries the era roster says are not present in this preset at all. */
export function absentCountryIds(preset: string): CountryId[] {
  if (!isShippingPreset(preset)) return [];
  return (Object.keys(COUNTRY_CONFIGS) as CountryId[]).filter(
    (id) => tierFor(preset, id) === "absent"
  );
}

/**
 * Delete region rows that belong to countries absent from `preset`. Runs after
 * every seeder, so a country the preset seeds is never affected: the roster is
 * the same source the bootstrap packs gate on.
 */
export async function purgeAbsentCountryRegions(
  db: Db,
  preset: string
): Promise<{ countryIds: CountryId[]; deleted: Record<string, number> }> {
  const countryIds = absentCountryIds(preset);
  const deleted: Record<string, number> = {};
  if (!isShippingPreset(preset)) return { countryIds, deleted };
  if (countryIds.length > 0) {
    for (const name of ABSENT_COUNTRY_REGION_COLLECTIONS) {
      const result = await db.collection(name).deleteMany({ countryId: { $in: countryIds } });
      if (result.deletedCount > 0) deleted[name] = result.deletedCount;
    }
    // Party sequence counters for those countries; a fresh world has none.
    const counters = await db
      .collection<{ _id: string }>("counters")
      .deleteMany({ _id: { $in: countryIds.map((id) => `party_${id}`) } });
    if (counters.deletedCount > 0) deleted.counters = counters.deletedCount;
  }

  // `politicalMetrics` is keyed by region id; some retired regions linger with
  // stale rows. Use the states roster as authority, with the non-empty guard so
  // a partial bootstrap cannot erase the board.
  const stateIds = (
    await statesCollection<{ _id: string }>(db).find({}).project({ _id: 1 }).toArray()
  ).map((state) => state._id);
  if (stateIds.length > 0) {
    const result = await db.collection("politicalMetrics").deleteMany({ _id: { $nin: stateIds } });
    if (result.deletedCount > 0) {
      deleted.politicalMetrics = (deleted.politicalMetrics ?? 0) + result.deletedCount;
    }
  }
  return { countryIds, deleted };
}
