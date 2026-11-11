import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { StateDemographics, StateDemographicTurnout, State } from "@/lib/db/types";
import { stateDemographics } from "@/lib/seeds/stateDemographics";
import { calculateStateLeanForCache } from "@/lib/demographics/cachedStateLean";
import { STATE_IDS } from "@/lib/constants/states";
import { DEMOGRAPHIC_TURNOUT_RATES } from "@/lib/seeds/demographicCategories";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { stateDemographicTurnoutCollection } from "@/lib/db/repositories/stateDemographicTurnout";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";

/** The static US bundle seeded here is the 2019 census. */
const US_STATIC_PRESET = "2019-default";

export async function seedDemographics(db: Db, reset: boolean, log: (msg: string) => void) {
  if (reset) {
    const usIds = [...STATE_IDS];
    await stateDemographicsCollection(db).deleteMany({ _id: { $in: usIds } });
    await demographicDefaultsCollection(db).deleteMany({ _id: { $in: usIds } });
    await stateDemographicTurnoutCollection(db).deleteMany({ _id: { $in: usIds } });
  }

  const demoTime = new Date();
  const stateDemoUpserts: AnyBulkWriteOperation<StateDemographics>[] = stateDemographics.map(
    (sd) => {
      const { _id, groups: _groups, ...sdData } = sd;
      return {
        updateOne: {
          filter: { _id },
          update: { $set: sdData },
          upsert: true,
        },
      };
    }
  );
  const stateLeanOps: AnyBulkWriteOperation<State>[] = stateDemographics.map((sd) => {
    const calculatedLean = calculateStateLeanForCache(sd, [], {
      countryId: "US",
      stateId: sd._id,
      preset: US_STATIC_PRESET,
      demographicDefaults: sd,
    });
    return {
      updateOne: {
        filter: { _id: sd._id },
        update: {
          $set: {
            cachedEconomicLean: calculatedLean.economicLean,
            cachedSocialLean: calculatedLean.socialLean,
            demographicsLastUpdated: demoTime,
          },
        },
      },
    };
  });
  if (stateDemoUpserts.length > 0) {
    await stateDemographicsCollection(db).bulkWrite(stateDemoUpserts, { ordered: false });
    await demographicDefaultsCollection(db).bulkWrite(stateDemoUpserts, { ordered: false });
    await statesCollection(db).bulkWrite(stateLeanOps, { ordered: false });
  }

  // US stateDemographicTurnout (required for Turnout tab; not dropped for UK)
  const usStateIds = [...STATE_IDS];
  const now = new Date();
  const emptyModifiers: Record<string, Record<string, number>> = {
    race: Object.fromEntries(
      (Object.keys(DEMOGRAPHIC_TURNOUT_RATES.race) as string[]).map((k) => [k, 0])
    ),
    age: Object.fromEntries(
      (Object.keys(DEMOGRAPHIC_TURNOUT_RATES.age) as string[]).map((k) => [k, 0])
    ),
    education: Object.fromEntries(
      (Object.keys(DEMOGRAPHIC_TURNOUT_RATES.education) as string[]).map((k) => [k, 0])
    ),
    wealth: Object.fromEntries(
      (Object.keys(DEMOGRAPHIC_TURNOUT_RATES.wealth) as string[]).map((k) => [k, 0])
    ),
    ideology: Object.fromEntries(
      (Object.keys(DEMOGRAPHIC_TURNOUT_RATES.ideology) as string[]).map((k) => [k, 0])
    ),
  };
  const turnoutOps: AnyBulkWriteOperation<StateDemographicTurnout>[] = usStateIds.map(
    (stateId) => ({
      updateOne: {
        filter: { _id: stateId },
        update: {
          $set: {
            countryId: "US" as const,
            modifiers: emptyModifiers,
            lastDecayApplied: now,
            lastUpdated: now,
          },
        },
        upsert: true,
      },
    })
  );
  if (turnoutOps.length > 0) {
    await stateDemographicTurnoutCollection(db).bulkWrite(turnoutOps, { ordered: false });
  }
  log(
    `Seeded ${stateDemographics.length} state demographics, ${usStateIds.length} US turnout docs`
  );
}
