/**
 * Era Checkpoint Turn, applies each active `EraCheckpoint`'s pull to the
 * targeted states' Layer-1 census buckets (see
 * `src/lib/demographics/eraCheckpoints.ts`).
 *
 * Every checkpoint target is a (`dim`, `bucket`) pair. Lean pulls go through
 * `layer1PositionOverrides[dim][bucket].<axis>`; turnout pulls go through
 * `layer1TurnoutOverrides[dim][bucket]` and are applied BEFORE cell
 * derivation via `applyDurableBucketTurnoutShift`. These are the only
 * channels the granular vote path reads, archetype-level writes are
 * invisible to it.
 *
 * Counter-pressure reads the bill shifts keyed on the same `dim:bucket`.
 *
 * Ordering: MUST run strictly after `processAllStateDemographics` in the same
 * turn, awaited, never in the same `Promise.all`, both write
 * `demographicDefaults` for the same state and would race a lost update.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { StateDemographics } from "@/lib/db/types/demographics";
import type { DocketCase } from "@/lib/db/types/scotus";
import type { LegislationType } from "@/lib/db/types/legislation";
import { getActivePoliciesForState, type LegislationTypeMap } from "@/lib/policyEffects";
import { calculateDemographicShiftsByTarget } from "@/lib/demographicEffects";
import { calendarTurn, type CalendarClock } from "@/lib/utils/gameDate";
import {
  applyDurableBucketShift,
  applyDurableBucketTurnoutShift,
  readLayer1Overlay,
  readLayer1TurnoutOverlay,
  type DurableShiftAccumulators,
} from "@/lib/demographics/durableRealignment";
import {
  ERA_CHECKPOINTS,
  resolveCheckpointStartTurn,
  isCheckpointActive,
  computeCheckpointRawDelta,
  applyCounterPressure,
  checkpointRunsInWorld,
  isCheckpointGateOpen,
  type EraCheckpoint,
  type DocketCaseLookupEntry,
} from "@/lib/demographics/eraCheckpoints";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

export interface EraCheckpointTurnResult {
  checkpointsActive: number;
  statesUpdated: number;
}

const NO_RESULT: EraCheckpointTurnResult = { checkpointsActive: 0, statesUpdated: 0 };

/** Resolve which registered checkpoints for `countryId` are active this turn, and at what start turn. */
async function resolveActiveCheckpoints(
  db: Db,
  countryId: CountryId,
  currentTurn: number,
  clock: CalendarClock,
  worldStartingYear: number
): Promise<Array<{ checkpoint: EraCheckpoint; startTurn: number }>> {
  const checkpoints = ERA_CHECKPOINTS.filter(
    (c) => c.countryId === countryId && checkpointRunsInWorld(c, worldStartingYear)
  );
  if (checkpoints.length === 0) return [];

  const caseKeys = [
    ...new Set(checkpoints.map((c) => c.triggerCaseKey).filter(Boolean)),
  ] as string[];
  const docketByKey = new Map<string, DocketCaseLookupEntry>();
  if (caseKeys.length > 0) {
    const cases = await db
      .collection<DocketCase>("docketCases")
      .find({ countryId, caseKey: { $in: caseKeys } })
      .toArray();
    for (const c of cases) {
      docketByKey.set(c.caseKey, {
        status: c.status,
        outcome: c.outcome,
        decidedAtTurn: c.decidedAtTurn,
      });
    }
  }

  // Everything below is in CALENDAR space: `resolveCheckpointStartTurn` maps a
  // trigger case's raw `decidedAtTurn` through the same clock, and every
  // `fallbackStartTurn` is authored via `yearToTurn(...)`. `durationTurns` is
  // a span, identical in either space.
  const calTurn = calendarTurn(currentTurn, clock);
  return checkpoints
    .map((checkpoint) => ({
      checkpoint,
      startTurn: resolveCheckpointStartTurn(
        checkpoint,
        checkpoint.triggerCaseKey ? docketByKey.get(checkpoint.triggerCaseKey) : undefined,
        clock
      ),
    }))
    .filter(({ checkpoint, startTurn }) => isCheckpointActive(checkpoint, startTurn, calTurn));
}

/**
 * Apply one turn of every active era-checkpoint's pull, per targeted state,
 * netted against any opposing legislative demographic-effect shift currently
 * active in that state for the same bucket+axis. Moves the durable overlays on
 * the seeded `demographicDefaults` snapshot (see the module doc comment on
 * `eraCheckpoints.ts` for why that is the substrate a checkpoint owns).
 */
export async function processEraCheckpointsTurn(
  db: Db,
  currentTurn: number,
  countryId: CountryId = "US"
): Promise<EraCheckpointTurnResult> {
  // Each checkpoint names the world start it was authored against (the
  // 1950s-60s history for 1953, the modern realignments for 2027); its start
  // turns are absolute from that year, so it must not run in any other world.
  const gameStateDoc = await gameStateCollection<{
    _id: string;
    startingYear?: number;
    preIterationTurns?: number;
    preIteration?: { active?: boolean };
  }>(db).findOne(
    { _id: "current" },
    { projection: { startingYear: 1, preIterationTurns: 1, preIteration: 1 } }
  );
  const worldStartingYear = gameStateDoc?.startingYear ?? 2019;

  const clock: CalendarClock = {
    preIterationActive: gameStateDoc?.preIteration?.active,
    preIterationTurns: gameStateDoc?.preIterationTurns,
  };
  const active = await resolveActiveCheckpoints(
    db,
    countryId,
    currentTurn,
    clock,
    worldStartingYear
  );
  if (active.length === 0) return NO_RESULT;

  const stateIds = new Set<string>();
  for (const { checkpoint } of active) {
    for (const target of checkpoint.targets) {
      for (const stateId of target.stateIds) stateIds.add(stateId);
    }
  }
  if (stateIds.size === 0) return NO_RESULT;

  const gateMetrics = [
    ...new Set(active.map((a) => a.checkpoint.gate?.metric).filter(Boolean)),
  ] as string[];
  const [legTypes, demographicsDocs, defaultsDocs, metricsDocs] = await Promise.all([
    // full-read(legislationTypes): the era checkpoint re-applies every law through the policy-effects map
    legislationTypesCollection(db).find({}).toArray(),
    stateDemographicsCollection(db)
      .find({ _id: { $in: [...stateIds] } })
      .toArray(),
    db
      .collection<StateDemographics>("demographicDefaults")
      .find({ _id: { $in: [...stateIds] } })
      .toArray(),
    gateMetrics.length === 0
      ? Promise.resolve([] as Array<{ _id: string }>)
      : macroMetricsCollection<{ _id: string }>(db)
          .find(
            { _id: { $in: [...stateIds] } },
            { projection: Object.fromEntries(gateMetrics.map((m) => [m, 1])) }
          )
          .toArray(),
  ]);
  const metricsByState = new Map(metricsDocs.map((d) => [String(d._id), d]));
  const legTypeMap: LegislationTypeMap = new Map(legTypes.map((lt) => [lt._id, lt]));
  const demographicsByState = new Map(demographicsDocs.map((d) => [String(d._id), d]));
  const defaultsByState = new Map(defaultsDocs.map((d) => [String(d._id), d]));

  const now = new Date();
  const liveOps: AnyBulkWriteOperation<StateDemographics>[] = [];
  const defaultOps: AnyBulkWriteOperation<StateDemographics>[] = [];
  let statesUpdated = 0;

  for (const stateId of stateIds) {
    const demographics = demographicsByState.get(stateId);
    if (!demographics) continue;

    const policies = await getActivePoliciesForState(db, stateId, countryId);
    const counterShifts = calculateDemographicShiftsByTarget(policies, legTypeMap);

    const acc: DurableShiftAccumulators = { liveUpdates: {}, defaultUpdates: {} };
    const defaults = defaultsByState.get(stateId);

    for (const { checkpoint, startTurn: _startTurn } of active) {
      if (!isCheckpointGateOpen(checkpoint.gate, metricsByState.get(stateId))) continue;
      for (const target of checkpoint.targets) {
        if (!target.stateIds.includes(stateId)) continue;
        const rawDelta = computeCheckpointRawDelta(target, checkpoint);

        if (target.dim && target.bucket) {
          // Bucket target: direct Layer-1 targeting. Legislation shifts keyed
          // on the same bucket net against the checkpoint pull.
          const counterShiftPerTurn =
            counterShifts[target.axis][`${target.dim}:${target.bucket}`] ?? 0;
          const netDelta = applyCounterPressure(rawDelta, counterShiftPerTurn);

          const axis = target.axis;
          const dim = target.dim;
          const bucket = target.bucket;
          if (axis === "turnout") {
            applyDurableBucketTurnoutShift(
              dim,
              bucket,
              netDelta,
              (d, b) => readLayer1TurnoutOverlay(defaults, d, b),
              acc
            );
          } else {
            applyDurableBucketShift(
              dim,
              bucket,
              axis,
              netDelta,
              (d, b) => readLayer1Overlay(defaults, d, b, axis),
              acc
            );
          }
        }
      }
    }
    const { liveUpdates, defaultUpdates } = acc;
    const hasLiveUpdates = Object.keys(liveUpdates).length > 0;
    const hasDefaultUpdates = Object.keys(defaultUpdates).length > 0;

    // BUCKET-kind targets (see eraCheckpoints.ts) never populate `liveUpdates`
    // — there is no archetype to carry them on the legacy live doc, only the
    // granular overlay. A state with ONLY bucket targets active this turn
    // (e.g. a national bucket checkpoint with no archetype targets at all —
    // NATIONAL_CIVIL_RIGHTS_ACT_CHECKPOINT, VOTING_RIGHTS_ACT_ENFRANCHISEMENT_CHECKPOINT,
    // REYNOLDS_REAPPORTIONMENT_CHECKPOINT, GRISWOLD_PRIVACY_CHECKPOINT,
    // MIRANDA_LAW_AND_ORDER_CHECKPOINT) would
    // therefore have `liveUpdates` empty while `defaultUpdates` is populated —
    // gating on `liveUpdates` alone would silently drop that overlay write
    // every single turn. Check both independently.
    if (!hasLiveUpdates && !hasDefaultUpdates) continue;
    statesUpdated++;
    if (hasLiveUpdates) {
      liveOps.push({
        updateOne: {
          filter: { _id: stateId },
          update: { $set: { ...liveUpdates, lastUpdated: now } },
        },
      });
    }
    if (hasDefaultUpdates) {
      defaultOps.push({
        updateOne: {
          filter: { _id: stateId },
          update: { $set: { ...defaultUpdates, lastUpdated: now } },
        },
      });
    }
  }

  if (liveOps.length > 0) {
    await stateDemographicsCollection(db).bulkWrite(liveOps);
  }
  if (defaultOps.length > 0) {
    await db.collection<StateDemographics>("demographicDefaults").bulkWrite(defaultOps);
  }

  return { checkpointsActive: active.length, statesUpdated };
}
