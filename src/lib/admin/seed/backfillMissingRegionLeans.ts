/**
 * Seeded regions receive electorate leans before a reset opens the new world.
 * Missing caches are derived from each region's census electorate; valid
 * existing region leans are retained. Regions with no census remain visibly
 * unfilled.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { State, StateDemographics } from "@/lib/db/types";
import { censusCachedStateLean } from "@/lib/demographics/cachedStateLean";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

export async function backfillMissingRegionLeans(db: Db, now: Date, preset: string) {
  const states = await statesCollection(db)
    .find(
      {},
      {
        projection: { countryId: 1, cachedEconomicLean: 1, cachedSocialLean: 1 },
      }
    )
    .toArray();
  const valid = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 5;
  const missing = states.filter(
    (row) => !valid(row.cachedEconomicLean) || !valid(row.cachedSocialLean)
  );
  if (!missing.length) return { written: 0, missingDemographics: 0, missingCategories: 0 };
  const demographics = await stateDemographicsCollection(db)
    .find(
      { _id: { $in: missing.map((row) => row._id) } },
      {
        projection: {
          countryId: 1,
          categoryWeights: 1,
          layer1PositionOverrides: 1,
          layer1TurnoutOverrides: 1,
        },
      }
    )
    .toArray();
  const byRegion = new Map(demographics.map((row) => [row._id, row]));
  const stateOps: AnyBulkWriteOperation<State>[] = [],
    demoOps: AnyBulkWriteOperation<StateDemographics>[] = [];
  let missingDemographics = 0,
    missingCategories = 0;
  for (const state of missing) {
    const demo = byRegion.get(state._id);
    if (!demo || demo.countryId !== state.countryId) {
      missingDemographics++;
      continue;
    }
    const lean = censusCachedStateLean(demo, {
      countryId: demo.countryId,
      stateId: state._id,
      preset,
    });
    if (!lean || !valid(lean.economicLean) || !valid(lean.socialLean)) {
      missingCategories++;
      continue;
    }
    const caches = { cachedEconomicLean: lean.economicLean, cachedSocialLean: lean.socialLean };
    demoOps.push({
      updateOne: { filter: { _id: demo._id, countryId: demo.countryId }, update: { $set: caches } },
    });
    stateOps.push({
      updateOne: {
        filter: { _id: state._id, countryId: state.countryId },
        update: { $set: { ...caches, demographicsLastUpdated: now } },
      },
    });
  }
  if (stateOps.length) {
    // The states cache is the completion marker. Write it last so a retry after
    // a failed demographic-cache write still selects this region.
    await stateDemographicsCollection(db).bulkWrite(demoOps, { ordered: false });
    await statesCollection(db).bulkWrite(stateOps, { ordered: false });
  }
  return { written: stateOps.length, missingDemographics, missingCategories };
}
