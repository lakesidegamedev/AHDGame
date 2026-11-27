import { fenceEconomicTurn } from "@/lib/api/withAtomicEconomicCommand";
import { ApiError } from "@/lib/api/errors";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { StateDemographics, StateDemographicTurnout, State } from "@/lib/db/types";
import {
  generateStateDemographics,
  registerAndGenerate,
  stateCensusData,
} from "@/lib/seeds/stateDemographics";
import { stateCensusData1953 } from "@/lib/seeds/stateCensusData1953";
import { stateCensusData1979 } from "@/lib/seeds/stateCensusData1979";
import { stateCensusData1991 } from "@/lib/seeds/stateCensusData1991";
import { stateCensusData1999 } from "@/lib/seeds/stateCensusData1999";
import { stateCensusData2007 } from "@/lib/seeds/stateCensusData2007";
import { stateCensusData2023 } from "@/lib/seeds/stateCensusData2023";
import { stateCensusData2027 } from "@/lib/seeds/stateCensusData2027";
import { selectPresetBundle, strictEraForPreset } from "@/lib/seeds/presetSelector";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { loadEraFullOverride } from "@/lib/seeds/loadEraPositionOverride";
import { calculateStateLeanForCache } from "@/lib/demographics/cachedStateLean";
import { afterCommit, withSessionDb } from "@/lib/db/sessionDb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { stateDemographicTurnoutCollection } from "@/lib/db/repositories/stateDemographicTurnout";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";

/** Top up the active era's US census without replacing live demographics or turnout. */
export async function seedDemographics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  requestedPreset?: string,
  idleOnly = false
) {
  return withSessionDb(db, async (db) => {
    if (idleOnly) {
      const refusal = await fenceEconomicTurn(db);
      if (refusal) throw new ApiError(refusal.status, refusal.error);
    }
    const state = await gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { preset: 1, currentYear: 1, startingYear: 1 } }
    );
    if (idleOnly && requestedPreset && state?.preset && requestedPreset !== state.preset)
      throw new ApiError(409, "Demographics must use the active world's era preset.");
    const preset = requestedPreset ?? state?.preset ?? DEFAULT_SEED_PRESET;
    const era = strictEraForPreset(preset);
    const census = selectPresetBundle(
      preset,
      {
        "1953-default": stateCensusData1953,
        "1979-default": stateCensusData1979,
        "1991-default": stateCensusData1991,
        "1999-default": stateCensusData1999,
        "2007-default": stateCensusData2007,
        "2019-default": stateCensusData,
        "2023-default": stateCensusData2023,
        "2027-default": stateCensusData2027,
      },
      "seedDemographics:US census"
    );
    const override = (await loadEraFullOverride(era, db)) ?? undefined;
    const options = {
      layer1Positions: true,
      positions: override?.positions,
      turnout: override?.turnout,
    };
    const documents = Object.entries(census).map(([id, config]) =>
      generateStateDemographics(id, config, era, "US", options)
    );
    const ids = documents.map((row) => row._id),
      now = new Date();
    if (reset) {
      await stateDemographicsCollection(db).deleteMany({ _id: { $in: ids } });
      await demographicDefaultsCollection(db).deleteMany({ _id: { $in: ids } });
      await stateDemographicTurnoutCollection(db).deleteMany({ _id: { $in: ids } });
    }
    const censusOps: AnyBulkWriteOperation<StateDemographics>[] = documents.map(
      ({ _id, groups: _groups, ...data }) => ({
        updateOne: {
          filter: { _id },
          update: { $setOnInsert: data },
          upsert: true,
        },
      })
    );
    const turnoutOps: AnyBulkWriteOperation<StateDemographicTurnout>[] = ids.map((_id) => ({
      updateOne: {
        filter: { _id },
        update: {
          $setOnInsert: {
            countryId: "US" as const,
            modifiers: {},
            lastDecayApplied: now,
            lastUpdated: now,
          },
        },
        upsert: true,
      },
    }));
    if (censusOps.length) {
      await stateDemographicsCollection(db).bulkWrite(censusOps);
      await demographicDefaultsCollection(db).bulkWrite(censusOps);
      await stateDemographicTurnoutCollection(db).bulkWrite(turnoutOps);
    }
    const [live, baselines, turnout] = await Promise.all([
      stateDemographicsCollection(db)
        .find({ _id: { $in: ids } })
        .toArray(),
      demographicDefaultsCollection(db)
        .find({ _id: { $in: ids } })
        .toArray(),
      stateDemographicTurnoutCollection(db)
        .find({ _id: { $in: ids } })
        .toArray(),
    ]);
    const baselineById = new Map(baselines.map((row) => [row._id, row]));
    const turnoutById = new Map(turnout.map((row) => [row._id, row]));
    const leanOps: AnyBulkWriteOperation<State>[] = live.map((row) => {
      const lean = calculateStateLeanForCache(row, [], {
        countryId: "US",
        stateId: row._id,
        preset,
        demographicDefaults: baselineById.get(row._id),
        turnoutDoc: turnoutById.get(row._id),
        year: reset ? Number(era) : (state?.currentYear ?? Number(era)),
        startingYear: reset ? Number(era) : (state?.startingYear ?? Number(era)),
      });
      return {
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              cachedEconomicLean: lean.economicLean,
              cachedSocialLean: lean.socialLean,
              demographicsLastUpdated: now,
            },
          },
        },
      };
    });
    if (leanOps.length) await statesCollection(db).bulkWrite(leanOps);
    await afterCommit(db, () => {
      for (const [id, config] of Object.entries(census))
        registerAndGenerate(id, config, era, options);
      log(`Ensured ${documents.length} US demographic baselines and turnout rows (${preset})`);
    });
    return documents.length;
  });
}
