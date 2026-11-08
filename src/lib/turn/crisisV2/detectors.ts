import { getStatesCollection } from "@/lib/db/collections/states";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import {
  reopenCooldownActive,
  stepDetector,
  type DetectorReading,
  type DetectorSpec,
  type ResolvedCrisisRecord,
} from "@/lib/crises/v2/detector";
import { DEFAULT_REOPEN_COOLDOWN_TURNS } from "@/lib/crises/v2/types";
import type { Crisis } from "@/lib/db/types/crisis";
import type { StreakRecord } from "@/lib/crises/v2/streak";
import {
  bankStressProvider,
  energyPriceGapProvider,
  gdpGrowthProvider,
  bondYieldPressureProvider,
  loadStateMetricValues,
  unrestGapProvider,
} from "./inputProviders";
import {
  getCrisisDefinition,
  type CrisisInputContext,
  type CrisisInputProvider,
  type CrisisOpenCandidate,
  type CrisisOpenCandidateProvider,
} from "./registry";

export const DETECTOR_STREAK_COLLECTION = "crisisDetectorStreaks";

interface StreakDoc extends StreakRecord {
  _id: string;
  detectorId: string;
  key: string;
}

interface DetectorWorld {
  inputs: CrisisInputContext;
  countryByState: ReadonlyMap<string, string>;
}

const worldCache = new WeakMap<Db, { turn: number; world: Promise<DetectorWorld> }>();

/** Every country and region, read once per turn and shared by all detectors. */
function loadDetectorWorld(db: Db, turn: number): Promise<DetectorWorld> {
  const cached = worldCache.get(db);
  if (cached?.turn === turn) return cached.world;
  const world = (async (): Promise<DetectorWorld> => {
    const states = await (
      await getStatesCollection(db)
    )
      .find({}, { projection: { _id: 1, countryId: 1 } })
      .toArray();
    const stateIdsByCountry = new Map<string, string[]>();
    const countryByState = new Map<string, string>();
    for (const state of states) {
      const ids = stateIdsByCountry.get(state.countryId) ?? [];
      ids.push(state._id);
      stateIdsByCountry.set(state.countryId, ids);
      countryByState.set(state._id, state.countryId);
    }
    return {
      inputs: { db, turn, countryIds: new Set(stateIdsByCountry.keys()), stateIdsByCountry },
      countryByState,
    };
  })();
  worldCache.set(db, { turn, world });
  return world;
}

export interface DetectorSource {
  spec: DetectorSpec;
  read(world: DetectorWorld): Promise<DetectorReading[]>;
}

function countryReadings(provider: CrisisInputProvider) {
  return async (world: DetectorWorld): Promise<DetectorReading[]> => {
    const values = await provider.load(world.inputs);
    return [...values].map(([countryId, value]) => ({
      key: countryId,
      countryIds: [countryId],
      regionIds: [],
      value,
    }));
  };
}

async function readRegionalUnemployment(world: DetectorWorld): Promise<DetectorReading[]> {
  const values = await loadStateMetricValues(
    world.inputs.db,
    [...world.countryByState.keys()],
    "unemploymentRate"
  );
  const readings: DetectorReading[] = [];
  for (const [stateId, value] of values) {
    const countryId = world.countryByState.get(stateId);
    if (countryId)
      readings.push({ key: stateId, countryIds: [countryId], regionIds: [stateId], value });
  }
  return readings;
}

/** Growth at or below this for a sustained run is a recession. */
const RECESSION_GROWTH_PCT = -0.5;
/** Worst bank stress on the 0..100 scale that counts as a panic building. */
const BANK_PANIC_STRESS = 30;
/** Extra sovereign borrowing premium, in basis points, that marks a debt crisis. */
const DEBT_CRISIS_PREMIUM_BPS = 100;
/** Regional unemployment, in percent, that marks a jobs shock. */
const REGIONAL_JOBS_SHOCK_PCT = 12;
/** Energy price premium over normal, in points, that marks a shortage. */
const ENERGY_SHORTAGE_GAP = 30;
/** Approval shortfall against normal, in points, that marks unrest. */
const UNREST_GAP = 10;

export const DETECTOR_SOURCES: readonly DetectorSource[] = [
  {
    spec: {
      id: "detector-recession",
      definitionId: "emergent-recession",
      scope: "national",
      comparator: "atMost",
      threshold: RECESSION_GROWTH_PCT,
      sustainedTurns: 6,
      priority: 5,
    },
    read: countryReadings(gdpGrowthProvider),
  },
  {
    spec: {
      id: "detector-banking-panic",
      definitionId: "emergent-banking-panic",
      scope: "national",
      comparator: "atLeast",
      threshold: BANK_PANIC_STRESS,
      sustainedTurns: 3,
      priority: 8,
    },
    read: countryReadings(bankStressProvider),
  },
  {
    spec: {
      id: "detector-debt-crisis",
      definitionId: "emergent-debt-crisis",
      scope: "national",
      comparator: "atLeast",
      threshold: DEBT_CRISIS_PREMIUM_BPS,
      sustainedTurns: 6,
      priority: 6,
    },
    read: countryReadings(bondYieldPressureProvider),
  },
  {
    spec: {
      id: "detector-regional-jobs",
      definitionId: "emergent-regional-unemployment",
      scope: "state",
      comparator: "atLeast",
      threshold: REGIONAL_JOBS_SHOCK_PCT,
      sustainedTurns: 4,
      priority: 2,
    },
    read: readRegionalUnemployment,
  },
  {
    spec: {
      id: "detector-energy-shortage",
      definitionId: "emergent-energy-shortage",
      scope: "national",
      comparator: "atLeast",
      threshold: ENERGY_SHORTAGE_GAP,
      sustainedTurns: 4,
      priority: 4,
    },
    read: countryReadings(energyPriceGapProvider),
  },
  {
    spec: {
      id: "detector-unrest-wave",
      definitionId: "emergent-unrest-wave",
      scope: "national",
      comparator: "atLeast",
      threshold: UNREST_GAP,
      sustainedTurns: 4,
      priority: 3,
    },
    read: countryReadings(unrestGapProvider),
  },
];

async function saveStreaks(
  db: Db,
  spec: DetectorSpec,
  streaks: ReadonlyMap<string, StreakRecord>,
  previous: ReadonlyMap<string, StreakRecord>,
  cleared: readonly string[]
): Promise<void> {
  const ops: AnyBulkWriteOperation<StreakDoc>[] = [];
  for (const [key, record] of streaks) {
    const before = previous.get(key);
    if (before && before.count === record.count && before.lastTurn === record.lastTurn) continue;
    ops.push({
      updateOne: {
        filter: { _id: `${spec.id}|${key}` },
        update: {
          $set: { detectorId: spec.id, key, count: record.count, lastTurn: record.lastTurn },
        },
        upsert: true,
      },
    });
  }
  if (cleared.length > 0) {
    ops.push({
      deleteMany: { filter: { _id: { $in: cleared.map((key) => `${spec.id}|${key}`) } } },
    });
  }
  if (ops.length > 0) {
    await db.collection<StreakDoc>(DETECTOR_STREAK_COLLECTION).bulkWrite(ops, { ordered: false });
  }
}

/** Crises of the detector's definition that ended inside the longest cooldown window. */
async function loadRecentlyResolved(
  db: Db,
  spec: DetectorSpec,
  turn: number,
  needed: boolean
): Promise<ResolvedCrisisRecord[]> {
  if (!needed) return [];
  const cooldown =
    getCrisisDefinition(spec.definitionId)?.reopenCooldownTurns ?? DEFAULT_REOPEN_COOLDOWN_TURNS;
  const rows = await db
    .collection<Crisis>("crises")
    .find(
      {
        status: "resolved",
        "v2.definitionId": spec.definitionId,
        endTurn: { $gt: turn - cooldown },
      },
      { projection: { endTurn: 1, countryIds: 1, regionIds: 1 } }
    )
    .toArray();
  return rows.map((row) => ({
    endTurn: row.endTurn ?? turn,
    countryIds: row.countryIds ?? [],
    regionIds: row.regionIds ?? [],
  }));
}

/** Turns one source into an open-candidate provider that keeps its own streaks. */
export function createDetectorProvider(source: DetectorSource): CrisisOpenCandidateProvider {
  const { spec } = source;
  return {
    id: spec.id,
    async load({ db, turn }) {
      const world = await loadDetectorWorld(db, turn);
      const [readings, stored] = await Promise.all([
        source.read(world),
        db
          .collection<StreakDoc>(DETECTOR_STREAK_COLLECTION)
          .find({ detectorId: spec.id })
          .toArray(),
      ]);
      const previous = new Map(
        stored.map((doc) => [doc.key, { count: doc.count, lastTurn: doc.lastTurn }])
      );
      const step = stepDetector(spec, readings, previous, turn);
      await saveStreaks(db, spec, step.streaks, previous, step.cleared);
      const cooling = await loadRecentlyResolved(db, spec, turn, step.proposals.length > 0);
      const cooldown =
        getCrisisDefinition(spec.definitionId)?.reopenCooldownTurns ??
        DEFAULT_REOPEN_COOLDOWN_TURNS;
      const open = step.proposals.filter(
        ({ reading }) => !reopenCooldownActive(reading, cooling, cooldown, turn)
      );
      return open.map(({ reading, excess }): CrisisOpenCandidate => ({
        key: `${spec.id}|${reading.key}`,
        definitionId: spec.definitionId,
        scope: spec.scope,
        countryIds: reading.countryIds,
        regionIds: reading.regionIds,
        priority: spec.priority + Math.min(excess, 1),
      }));
    },
  };
}
