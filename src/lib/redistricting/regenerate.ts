import { withSessionDb } from "@/lib/db/sessionDb";
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";

import { buildDistrictDocsForStates } from "./buildStateDocs";
import { congressionalDistrictsCollection } from "@/lib/db/repositories/congressionalDistricts";

/**
 * Rebuild the district maps of the given states neutrally (from current
 * registration). Deletes their existing docs first so seat-count reductions
 * drop orphan indices. Regenerated docs keep `lastRedrawnCensus = null`, so a
 * legislature-drawn trifecta can still redraw this census.
 */
export async function regenerateCongressionalDistricts(
  db: Db,
  opts: { countryId: CountryId; stateIds: string[]; now: Date; preset?: string }
): Promise<{ regenerated: number }> {
  if (opts.stateIds.length === 0) return { regenerated: 0 };

  return withSessionDb(db, async (db) => {
    const coll = congressionalDistrictsCollection(db);
    await coll.deleteMany({
      countryId: opts.countryId,
      stateId: { $in: opts.stateIds },
    });

    const docs = await buildDistrictDocsForStates(
      db,
      opts.countryId,
      opts.now,
      opts.stateIds,
      opts.preset
    );
    if (docs.length > 0)
      await coll.bulkWrite(
        docs.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: doc },
            upsert: true,
          },
        }))
      );
    return { regenerated: docs.length };
  });
}
