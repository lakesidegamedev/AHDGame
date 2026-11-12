import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { State, StateDemographics } from "@/lib/db/types";
import { censusCachedStateLean } from "@/lib/demographics/cachedStateLean";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * Writes each region's census lean onto its `states` document. Policy distance,
 * region pickers and `getStateLean` read that cache, so a seeded country without
 * it renders as "lean not yet derived". A region with no census is skipped, not
 * written as neutral. Returns the number of regions written.
 */
export async function persistRegionLeans(
  db: Db,
  regionDemographics: StateDemographics[],
  preset: string
): Promise<number> {
  const now = new Date();
  const ops: AnyBulkWriteOperation<State>[] = [];
  for (const sd of regionDemographics) {
    const lean = censusCachedStateLean(sd, {
      countryId: sd.countryId,
      stateId: sd._id,
      preset,
      demographicDefaults: sd,
    });
    if (!lean) continue;
    ops.push({
      updateOne: {
        filter: { _id: sd._id },
        update: {
          $set: {
            cachedEconomicLean: lean.economicLean,
            cachedSocialLean: lean.socialLean,
            demographicsLastUpdated: now,
          },
        },
      },
    });
  }
  if (ops.length === 0) return 0;

  await statesCollection(db).bulkWrite(ops, { ordered: false });
  return ops.length;
}
