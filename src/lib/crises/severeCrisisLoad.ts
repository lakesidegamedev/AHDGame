import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { loadLivingConflictSevereCountryIds } from "@/lib/livingConflict/severeMemberships";
import { severeLoadByCountry, type SevereCrisisRow } from "./rules/severeLoad";

/** Active crises in the shape the stacking guard reads, in one round trip. */
export async function loadActiveSevereCrisisRows(db: Db): Promise<SevereCrisisRow[]> {
  return db
    .collection<Crisis>("crises")
    .find(
      { status: "active" },
      {
        projection: {
          _id: 0,
          scope: 1,
          countryIds: 1,
          opportunity: 1,
          livingConflictEventId: 1,
        },
      }
    )
    .toArray() as Promise<SevereCrisisRow[]>;
}

/**
 * Severe load per country across both systems: active crisis templates plus
 * active living conflicts. Two reads per call; callers load it once per turn
 * and update it in memory as they spawn.
 */
export async function loadCountrySevereLoad(
  db: Db,
  availableCountryIds: ReadonlySet<string>
): Promise<Map<string, number>> {
  const [crises, conflicts] = await Promise.all([
    loadActiveSevereCrisisRows(db),
    loadLivingConflictSevereCountryIds(db, availableCountryIds),
  ]);
  return severeLoadByCountry(crises, conflicts);
}
