import { corporationTurnRerunSet, startFreshJournal } from "@/simulation/engine/corporationResume";
import { resilienceStageOf } from "@/lib/turn/corporation/resume/rules";
import { drainDeferredTurnWork } from "@/lib/turn/deferredTurnWork";
import {
  executeTurnAdapters,
  isIndependentPoliticalPhase,
} from "@/simulation/engine/independentTurnRecovery";
import { rewindHalfTick } from "@/lib/turn/subhour/rewindHalfTick";
import {
  withServerTurnAnalytics,
  markServerTurnAnalyticsCommitted,
} from "@/lib/analytics/serverPosthog";
import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { ObjectId } from "mongodb";
import { getGameState, invalidateGameStateCache } from "@/lib/gameState";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import type {
  GameConfig,
  GameState,
  TurnLog,
  GameIteration,
  TurnPhaseTelemetryMap,
  GameHealthSummary,
} from "@/lib/db/types";
import { invalidateGameTimeCache, reconcileGameStateClock } from "@/lib/time/gameTime";
import { emit } from "@/lib/events";
import { resolveGeneralElections } from "@/lib/turn/electionResolution";
import { recordPrimarySnapshots } from "@/lib/turn/primaryResolution";
import {
  ensurePerpetualElections,
  ensureUKElections,
  ensureUKRegionalCouncilElections,
} from "@/lib/elections/scheduling";
import { STARTING_YEAR } from "@/lib/constants/turnTime";
import { DEFAULT_GAME_STATE_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";
import { DEFAULT_CYCLE_ANCHOR_CONTEXT } from "@/lib/elections/cycleAnchorContext";
import { seedUnownedSectors } from "@/lib/admin/seed/seedUnownedSectors";
import { processGameHealthSnapshot } from "@/lib/turn/gameHealthSnapshot";
import {
  TURN_LOCK_STALE_MS,
  shouldRecoverCrashedTurn,
  turnHasCommittedWrites,
  TURN_BOOTSTRAP_PHASE,
} from "@/lib/turn/processingLock";
import { getLatestCompletedTurnRealTime } from "@/lib/turn/turnLogQueries";
import { isAutoPauseDrift, formatDriftHours } from "@/lib/time/clockDrift";
import {
  createInitialTurnPhaseStatuses,
  finalizeAbortedPhaseStatuses,
} from "@/simulation/engine/phaseTelemetry";
import {
  formatRoundTripReport,
  resetRoundTripCounts,
  totalRoundTrips,
  withPhaseProfiling,
} from "@/lib/observability/mongoRoundTrips";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import type { TurnFailureInfo } from "@/lib/turn/rules/retryPolicy";
import { resolveTurnResilienceStage } from "@/lib/turn/rules/staleLock";
import {
  TURN_HOLDER_ID,
  TurnLockLostError,
  setTurnLockFence,
  turnLockFenceActive,
  turnLockFenceFilter,
} from "@/lib/turn/turnLockHolder";
import { armTurnFault, describeTurnError, parseTurnFaultSpec } from "@/lib/turn/faultInjection";
import { createTurnPhaseRuntime } from "@/simulation/engine/turnPhaseRuntime";
import {
  isResumeFailClosedError,
  TurnResumeRefusedError,
  TurnResumeResultUnavailableError,
  phaseBlocksResumeWhenInterrupted,
} from "@/simulation/engine/turnPhaseResumeResults";
import {
  bootstrapPhaseRecord,
  isUnownedFailedTurn,
  lockAcquisitionSet,
  staleRecoveryEvidenceReset,
  validateLockedResume,
  type ValidatedTurnResume,
} from "@/simulation/engine/turnResumeBootstrap";
import { buildTurnExecutionContext } from "@/simulation/engine/turnExecutionContext";
import { selectEngineForAttempt, type TurnEngine } from "@/simulation/engine/turnEngine";
import { recoverDemographicFlowsBeforeContext } from "@/lib/demographics/recoverFlows";
import {
  getTurnPhaseRegistry,
  independentCountryElectionPhases,
} from "@/simulation/phases/turnPhaseRegistry";
import { runWithLedgerTurn } from "@/lib/ledger/ledgerTurn";
import { getSimTurnPhasePredicate } from "@/simulation/phases/simTurnProfiles";
import { getEconomyPausePredicate } from "@/lib/turn/economyPause";
import {
  combinePhasePredicates,
  getSingleplayerPhasePredicate,
} from "@/simulation/phases/singleplayerPhases";
import { runPostTurnIntegrityScans } from "@/lib/turn/postTurnScans";
import { runCommittedTurnReporting } from "@/lib/turn/committedTurnReporting";
import { inProcessTurnRefusal } from "@/lib/turn/turnWorkerHandoff";
import { announcePendingSuggestionCompletions } from "@/lib/suggestions/completionAnnouncement";
import { runContestsAfterTurn } from "@/lib/contests/engine";
import { getAnomalyScanCadencePredicate } from "@/simulation/phases/anomalyScanCadence";
import { isSingleplayer } from "@/lib/singleplayer";
import { reconcileFederalBudgetInvariants } from "@/lib/budget/budgetInvariants";
import { publishPlatformEvent } from "@/lib/platformEvents";
import type { CompletedTurnPhaseObservation, TurnPhaseRuntime } from "@/simulation/engine/types";
import { completedMarketUpdateAt, completedTurnStatus } from "@/simulation/engine/turnCompletion";
import { startTurnMemorySampler, type TurnMemoryPeak } from "@/lib/turn/turnMemory";
import { captureTurnPosthog } from "@/lib/analytics/turnPosthog";
import { currentTurnBuild } from "@/lib/turn/turnBuild";
import { NPP_ENGINE_VERSION } from "@/lib/nppAutonomy/engineVersion";
import { nextScheduledTurnAfter, resolveTurnCronMinute } from "@/lib/cron/turnCronMinute";
import { resetResidueTurnRefusal } from "@/lib/admin/resetContract/rules/residueScan";
import { serverEnv } from "@/lib/config/read";
import { workerConfig } from "@/lib/config/worker";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { unownedSectorsCollection } from "@/lib/db/repositories/unownedSectors";
import type { Document } from "mongodb";
import { turnLogsCollection } from "@/lib/db/repositories/turnLogs";

/** Read once per process: the deployment does not change under a running server. */
const turnBuild = currentTurnBuild();

// Re-export public helpers consumed by other modules
export {
  recordPrimarySnapshots,
  resolveGeneralElections,
  ensurePerpetualElections,
  ensureUKElections,
  ensureUKRegionalCouncilElections,
};
export { getGameState, invalidateGameStateCache };

// ─── Game state helpers ───────────────────────────────────────────────────────

// Compatibility exports live above; turn orchestration state begins below.

export async function initializeGameState(): Promise<GameState> {
  const db = await getDb();
  const existing = await getGameState(db);
  if (existing) return existing;

  const now = new Date();
  const nextHour = nextScheduledTurnAfter(now, resolveTurnCronMinute());

  const initialState: GameState = {
    _id: "current",
    worldEpochId: new ObjectId().toHexString(),
    resetWorldId: randomUUID(),
    currentTurn: 1,
    hardwareInputReliefStartTurn: 1,
    stockHoldingTaxStartTurn: 1,
    currentYear: STARTING_YEAR,
    // Always pair `startingYear` with the matching `preset`. Writing only
    // `startingYear` previously left `preset` undefined, which made
    // `cycleAnchorContextFromGameState` silently fall back to 2019-default
    // even when the row's `startingYear` was updated to 1991 — producing
    // the "2023 NPC Delegate in a 1991 game" symptom on sandbox.
    // `resetGameWorld` still overwrites both when an admin selects a preset.
    startingYear: DEFAULT_CYCLE_ANCHOR_CONTEXT.startingYear,
    preset: DEFAULT_CYCLE_ANCHOR_CONTEXT.preset,
    isActive: false,
    lastTurnProcessed: now,
    nextScheduledTurn: nextHour,
    pausedAt: null,
    corporationActionsPaused: false,
    playerTransfersPaused: false,
    fastMode: false,
    processingKind: null,
    processingStartedAt: null,
    processingTargetTurn: null,
    processingHeartbeatAt: null,
    processingPhase: null,
    processingPhaseStatuses: null,
    processingPhaseResults: null,
    createdAt: now,
    updatedAt: now,
    // Fresh worlds start with the production feature-flag posture instead of
    // everything-off (see featureFlagDefaults.ts for the rationale).
    ...DEFAULT_GAME_STATE_FLAGS,
  };

  const gameStateCol = await getGameStateCollection(db);
  await gameStateCol.insertOne(initialState);
  return initialState;
}

// ─── Main turn processor ─────────────────────────────────────────────────────

// True only while THIS process holds the turn-processing lock. Used by the
// graceful-shutdown handler (src/lib/turn/shutdownHandler.ts) to release the
// lock when Railway sends SIGTERM mid-turn on a redeploy — otherwise the lock
// strands with a frozen heartbeat and no turn runs until the 20-min stale
// takeover on a later cron tick (2026-07 stuck-turn incident). Scoping the
// release to the acquiring process makes it safe across concurrent containers:
// a process never clears a lock it did not set.
let localTurnLockHeld = false;

/**
 * Best-effort release of a turn-processing lock held by THIS process. No-op if
 * this process does not currently hold the lock. Called on graceful shutdown so
 * a redeploy mid-turn recovers instantly instead of waiting out the stale TTL.
 * Guarded by `isProcessing: true` so it never resurrects a lock a newer process
 * already re-acquired and cleared.
 */
export async function releaseLocalProcessingLock(reason: string): Promise<boolean> {
  if (!localTurnLockHeld) return false;
  try {
    const db = await getDb();

    // How far did this turn get? A full release wipes `processingPhase` and
    // `processingPhaseStatuses`, which are exactly the fields `shouldRecoverCrashedTurn`
    // reads to decide whether re-running would double-apply. Releasing a turn that had
    // already committed writes therefore made the NEXT cron re-run it from the start and
    // pay every additive income phase twice: fund generation, corp dividends, savings
    // interest, bond coupons, treasury. The guard exists to prevent precisely that,
    // and a clean shutdown was defeating it.
    const live = await (
      await getGameStateCollection(db)
    ).findOne({ _id: "current" }, { projection: { processingPhase: 1 } });
    const committed = turnHasCommittedWrites(live?.processingPhase);

    if (committed) {
      // Keep the lock held and the evidence intact. `processingAbandonedAt` makes the
      // lock read as stale IMMEDIATELY, so the next cron consumes this turn rather than
      // serving the full 20-minute wait first. A deploy then costs the remainder of one
      // turn instead of that turn plus the next slot.
      await (
        await getGameStateCollection(db)
      ).updateOne(
        { _id: "current", isProcessing: true },
        { $set: { processingAbandonedAt: new Date(), updatedAt: new Date() } }
      );
      localTurnLockHeld = false;
      invalidateGameStateCache();
      console.warn(
        `[Turn System] Abandoned in-flight turn on ${reason} at phase ${live?.processingPhase}. ` +
          `Lock left held with evidence intact; the next tick will consume the turn rather ` +
          `than re-running and double-applying it.`
      );
      return true;
    }

    // Nothing committed yet, so the turn is losslessly re-runnable: release outright and
    // let the next container simply run it.
    await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current", isProcessing: true },
      {
        $set: {
          isProcessing: false,
          processingKind: null,
          processingStartedAt: null,
          processingTargetTurn: null,
          processingHeartbeatAt: null,
          processingPhase: null,
          processingPhaseStatuses: null,
          processingPhaseResults: null,
          processingAbandonedAt: null,
          updatedAt: new Date(),
        },
      }
    );
    localTurnLockHeld = false;
    invalidateGameStateCache();
    console.warn(`[Turn System] Released in-flight processing lock on ${reason}.`);
    return true;
  } catch (err) {
    console.error(`[Turn System] Failed to release processing lock on ${reason}:`, err);
    Sentry.captureException(err, {
      tags: { component: "turnSystem", op: "shutdownLockRelease" },
    });
    return false;
  }
}

function phasesStarted(phase: string | null): boolean {
  return phase != null && phase !== TURN_BOOTSTRAP_PHASE;
}

/** What a crashed previous holder left behind, for a resumed turn. */
type CrashedTurnRecovery = ValidatedTurnResume;

export function processTurn(
  options: Parameters<typeof processTurnImpl>[0] = {}
): ReturnType<typeof processTurnImpl> {
  // When the worker owns turns, the web server never runs one: a turn holds the
  // event loop and takes the site down for its whole duration (turn 372).
  const refusal = inProcessTurnRefusal(serverEnv());
  if (refusal) {
    console.error(`[Turn System] Refused in-process turn: ${refusal}`);
    return Promise.resolve({
      success: false,
      turn: 0,
      message: refusal,
      warnings: [],
      health: null,
    });
  }
  return withServerTurnAnalytics(() => processTurnImpl(options)).then((result) => {
    // The lock is released by now on every path; deferred telemetry runs in
    // the gap before the next turn instead of inside this one.
    void drainDeferredTurnWork();
    return result;
  });
}

export type TurnProcessResult = {
  success: boolean;
  turn: number;
  message: string;
  warnings: string[];
  health: GameHealthSummary | null;
  /** Present when the turn stopped on an error; drives automatic retry. */
  failure?: TurnFailureInfo;
};

async function processTurnImpl(
  options: {
    /** Sandbox tooling hook. Production callers omit it. */
    onPhaseCompleted?: (phase: CompletedTurnPhaseObservation) => Promise<void>;
    /** Set by the automatic retry loop so the turn log tells the story. */
    retryAttempt?: { attempt: number; of: number; afterPhase: string | null };
  } = {}
): Promise<TurnProcessResult> {
  const warnings: string[] = [];
  if (options.retryAttempt) {
    const r = options.retryAttempt;
    warnings.push(
      `turnRetry: automatic attempt ${r.attempt} of ${r.of} after ${r.afterPhase ?? "setup"} stopped the turn`
    );
  }
  const startTime = Date.now();
  let activeTurn = 0;
  let activeGameNow: Date | null = null;
  let activeCurrentYear = STARTING_YEAR;
  let activeIteration: GameIteration | undefined;
  /**
   * Engine resolved for this attempt. Hoisted out of the lock block so the crash
   * turn log can report it; null when the turn died before it was resolved.
   */
  let activeEngine: TurnEngine | null = null;
  const currentPhaseRef = { current: null as string | null };
  let phaseStatusesForFailure: TurnPhaseTelemetryMap | null = null;
  let phaseResultsForFailure: TurnLog["phases"] | null = null;
  let phaseRuntimeForFailure: TurnPhaseRuntime | null = null;
  let turnLogWritten = false;
  let healthSnapshotWritten = false;
  let lastHealth: GameHealthSummary | null = null;
  // If the previous lock holder died after phases began committing writes,
  // do NOT re-run that turn: committed income phases would double-apply.
  // Captured from the pre-lock snapshot, acted on once we hold the lock.
  let preLockRecoveryTarget: number | null = null;
  let resilienceStage = 0;
  /** Set when this turn is a resume; drives the phase skip set below. */
  let resumedFromCrash: CrashedTurnRecovery | null = null;
  const stopMemorySampler = startTurnMemorySampler(() => currentPhaseRef.current);
  let memoryPeak: TurnMemoryPeak | null = null;
  const readMemoryPeak = () => (memoryPeak ??= stopMemorySampler());

  try {
    const db = await getDb();
    const localSingleplayer = isSingleplayer();
    const lockAcquiredAt = new Date();
    const staleLockCutoff = new Date(lockAcquiredAt.getTime() - TURN_LOCK_STALE_MS);

    // Auto-pause guard: if wall-clock time since the last *completed* turn
    // (by turnLog.realTime) exceeds AUTO_PAUSE_DRIFT_MS, cron has stopped
    // firing. Use realTime, not lastTurnProcessed (game/LARP clock), so a
    // steady game-clock offset after an outage does not false-positive.
    {
      const preLockState = await (await getGameStateCollection(db)).findOne({ _id: "current" });
      // SIM-ONLY: the drift guard models a LIVE deployment where an hourly cron
      // fires, so a long gap means it stopped. A headless sandbox has no cron (turns
      // run as fast as CPU allows), and a singleplayer world advances only on player
      // action, so a gap of days is normal. Resuming such a world would trip the
      // guard on its first turn. Undefined in production, so inert there.
      const turnConfig = localSingleplayer
        ? null
        : await gameConfigCollection(db).findOne({ _id: "default" });
      const simSandbox = localSingleplayer || turnConfig?.simSandbox === true;
      resilienceStage = resolveTurnResilienceStage({
        configStage: turnConfig?.turnResilienceStage,
        simSandbox: turnConfig?.simSandbox === true,
        envStage: workerConfig.turnResilienceStage(),
      });
      armTurnFault(
        turnConfig?.simSandbox === true ? parseTurnFaultSpec(workerConfig.turnFaultInject()) : null
      );
      const residueRefusal = resetResidueTurnRefusal(turnConfig?.lastReset);
      if (residueRefusal) {
        console.error(`[Turn System] Refused turn: ${residueRefusal}`);
        return { success: false, turn: 0, message: residueRefusal, warnings, health: null };
      }
      if (preLockState) {
        // Detect a stale lock left by a turn that crashed after phases
        // began applying writes. Recorded here; the recovery close-out runs
        // after we acquire the lock (and re-verifies against the locked state).
        if (
          shouldRecoverCrashedTurn(preLockState, lockAcquiredAt) &&
          typeof preLockState.processingTargetTurn === "number" &&
          typeof preLockState.processingPhase === "string"
        ) {
          // Everything the dead process recorded as completed, PLUS the phase it was
          // inside when it died. Completed phases must not repeat because their writes
          // landed; the interrupted one must not repeat because part of its writes may
          // have landed and no phase is guaranteed idempotent halfway through. Losing
          // that single phase is the price of resuming, against losing the ~150 the
          // turn had not reached yet, which is what consuming the turn cost.
          //
          // Only the target is taken from this pre-lock read. The phase state is read
          // from the locked document after takeover, which must name the same target
          //.
          preLockRecoveryTarget = preLockState.processingTargetTurn;
        } else if (isUnownedFailedTurn(preLockState)) {
          // A turn the ordinary failure path released after phases applied. Its
          // finalized statuses are exact for that holder, so it resumes under the
          // same rules instead of rerunning from scratch.
          preLockRecoveryTarget = preLockState.processingTargetTurn ?? null;
        }
        const lastTp = new Date(preLockState.lastTurnProcessed);
        const latestCronFire = localSingleplayer
          ? null
          : await getLatestCompletedTurnRealTime(preLockState);
        const rawAnchor = latestCronFire ?? lastTp;
        // Floor the drift anchor at the most recent resume. Without this floor,
        // the first turn after a long manual pause sees drift = entire pause
        // duration (e.g. 149h) and trips the 4h auto-pause guard immediately,
        // re-pausing the cron the moment the admin tried to start it.
        const resumeAnchor = preLockState.lastResumedAt
          ? new Date(preLockState.lastResumedAt)
          : null;
        const cronAnchor =
          resumeAnchor && resumeAnchor.getTime() > rawAnchor.getTime() ? resumeAnchor : rawAnchor;
        const cronDriftMs = lockAcquiredAt.getTime() - cronAnchor.getTime();
        const isBootstrap = preLockState.currentTurn <= 1 || lastTp.getFullYear() < 2020;
        const heartbeatAt = preLockState.processingHeartbeatAt
          ? new Date(preLockState.processingHeartbeatAt).getTime()
          : 0;
        const hasHealthyInFlightTurn =
          preLockState.isProcessing === true &&
          heartbeatAt > lockAcquiredAt.getTime() - TURN_LOCK_STALE_MS;
        if (
          !simSandbox &&
          !preLockState.pausedAt &&
          !isBootstrap &&
          !hasHealthyInFlightTurn &&
          isAutoPauseDrift(cronDriftMs)
        ) {
          await (
            await getGameStateCollection(db)
          ).updateOne(
            { _id: "current" },
            {
              $set: {
                isActive: false,
                pausedAt: lockAcquiredAt,
                pauseReason: `Auto-paused: no turn completed in ${formatDriftHours(cronDriftMs)} (cron may have stopped)`,
                pauseKind: "auto-drift",
                updatedAt: lockAcquiredAt,
              },
            }
          );
          invalidateGameStateCache();
          invalidateGameTimeCache();
          Sentry.captureMessage("Cron auto-paused due to drift", {
            level: "error",
            extra: {
              cronDriftMs,
              cronDriftHours: cronDriftMs / 3_600_000,
              lastTurnProcessed: preLockState.lastTurnProcessed,
              latestCompletedTurnRealTime: latestCronFire,
            },
          });
          console.error(
            `[Turn System] Auto-paused: no completed turn in ${formatDriftHours(cronDriftMs)}. Admin must investigate before resuming.`
          );
          return {
            success: false,
            turn: 0,
            message: `Auto-paused: no completed turn in ${formatDriftHours(cronDriftMs)}`,
            warnings: [],
            health: null,
          };
        }
      }
    }

    const unownedCount = await unownedSectorsCollection<Document>(db).countDocuments();
    if (unownedCount === 0) {
      // Seed at the WORLD's era. This used to ride the seeder's "2019-default"
      // parameter default, so a 1953 world auto-seeded modern sector floors
      // mid-turn.
      await seedUnownedSectors(
        db,
        (msg) => console.log(`[Turn] Auto-seed: ${msg}`),
        1,
        await getGameStatePresetOrDefault(db)
      );
    }

    const lockResult = await (
      await getGameStateCollection(db)
    ).findOneAndUpdate(
      {
        _id: "current",
        processingKind: { $nin: ["stockTaxMigration", "economyReset"] },
        $or: [
          { isProcessing: { $ne: true } },
          { processingHeartbeatAt: { $lt: staleLockCutoff } },
          {
            processingHeartbeatAt: { $exists: false },
            updatedAt: { $lt: staleLockCutoff },
          },
          // A lock whose holder announced its own death on the way out. Acquirable at
          // once: there is no process left to wait for, and serving the full staleness
          // window here is what makes a redeploy cost a second turn slot.
          { processingAbandonedAt: { $ne: null, $exists: true } },
        ],
      },
      {
        // Lock fields only. The crash evidence (target, phase, statuses, results)
        // stays as the dead holder left it until the locked document validates the
        // resume, so a crash during takeover or setup cannot erase it.
        $set: lockAcquisitionSet(lockAcquiredAt, TURN_HOLDER_ID),
      },
      { returnDocument: "after" }
    );
    if (!lockResult) {
      console.log("[Turn] Skipping - another turn is already processing");
      return {
        success: true,
        turn: 0,
        message: "Skipped: concurrent turn in progress",
        warnings: [],
        health: null,
      };
    }

    // This process now owns the lock — allow graceful shutdown to release it.
    localTurnLockHeld = true;
    // With the fast takeover on, a holder that lost its lock must not write over
    // the new holder's state: every lock-owner write below is conditional on it.
    setTurnLockFence(resilienceStage >= 1 ? TURN_HOLDER_ID : null);

    const gameState = lockResult;
    activeIteration = gameState.iteration ? { ...gameState.iteration } : undefined;

    // Crash recovery RESUMES the interrupted turn instead of consuming it.
    // `appliedPhases` names phases that must not rerun; `runPhase` skips exactly
    // those and the rest of the turn executes and advances the clock normally.
    // A phase reads the read-only turn context and writes its own
    // `phaseResults`. Phases that consume an earlier phase's result are listed
    // in `turnPhaseResumeResults.ts`, which stores a bounded copy of that result
    // with its completed status; a missing or interrupted one fails the
    // dependent explicitly rather than rerunning or assuming zero. The race
    // guard (target === currentTurn+1 against the freshly locked state) prevents
    // a spurious resume when a concurrent completion races the lock.
    const crashedTurnRecovery = validateLockedResume(
      gameState,
      preLockRecoveryTarget,
      await corporationTurnRerunSet(db, gameState)
    );
    if (crashedTurnRecovery) {
      resumedFromCrash = crashedTurnRecovery;
      const message =
        `Resuming crashed turn ${crashedTurnRecovery.targetTurn}: skipping ` +
        `${crashedTurnRecovery.appliedPhases.size} phase(s) already applied by the previous ` +
        `holder, which died at phase "${crashedTurnRecovery.lastPhase}"`;
      console.warn(`[Turn System] ${message}`);
      Sentry.captureMessage("Turn recovery: resuming after crash", {
        level: "warning",
        fingerprint: ["turn-crash-recovery"],
        extra: {
          recoveredTurn: crashedTurnRecovery.targetTurn,
          lastPhase: crashedTurnRecovery.lastPhase,
          skippedPhases: [...crashedTurnRecovery.appliedPhases],
        },
      });
      warnings.push(message);
      if (crashedTurnRecovery.interruptedMoneyMoving.length > 0) {
        // Money-moving steps were mid-flight when the holder died and are not
        // rerun, so this turn commits without them: it is not a success.
        const incomplete =
          `turn ${crashedTurnRecovery.targetTurn} is INCOMPLETE: interrupted steps not rerun: ` +
          crashedTurnRecovery.interruptedMoneyMoving.join(", ");
        warnings.push(`turnIncomplete: ${incomplete}`);
        Sentry.captureMessage("Turn resumed with interrupted money-moving steps skipped", {
          level: "fatal",
          fingerprint: ["turn-resume-interrupted-money-steps"],
          extra: {
            turn: crashedTurnRecovery.targetTurn,
            steps: crashedTurnRecovery.interruptedMoneyMoving,
            diedAt: crashedTurnRecovery.lastPhase,
          },
        });
      }
    } else {
      // Evidence that does not describe a resumable turn is cleared before setup
      // writes anything. Absent on a turn after a clean release: no round trip.
      const reset = staleRecoveryEvidenceReset(gameState);
      if (reset) {
        await (
          await getGameStateCollection(db)
        ).updateOne({ _id: "current", isProcessing: true }, { $set: reset });
      }
    }

    const repairedClock = await reconcileGameStateClock(gameState);
    gameState.currentTurn = repairedClock.currentTurn;
    gameState.currentYear = repairedClock.currentYear;
    gameState.lastTurnProcessed = repairedClock.lastTurnProcessed;

    // Population vectors, totals and readouts can land in separate writes.
    // Repair their frozen receipt before any resumed phase reads the context.
    await recoverDemographicFlowsBeforeContext(db, gameState, resumedFromCrash?.appliedPhases);

    const config = await gameConfigCollection(db).findOne({ _id: "default" });
    // One read of the selector per turn, before any phase runs. A resume pins the
    // engine recorded by the holder that died, so config can only choose the engine
    // for the NEXT turn — never for a turn that is already in progress.
    if (!resumedFromCrash)
      await startFreshJournal(
        db,
        resilienceStageOf(config),
        gameState.currentTurn + 1,
        gameState.worldEpochId
      );
    const engineResolution = selectEngineForAttempt({
      configured: config?.turnEngineVersion,
      inFlightEngine: gameState.processingEngine,
      isResume: resumedFromCrash != null,
    });
    const engine: TurnEngine = engineResolution.engine;
    activeEngine = engine;
    for (const engineWarning of engineResolution.warnings) warnings.push(engineWarning);
    // A resume starts from the inherited markers and stored results, so the
    // first status write below rewrites them rather than erasing them.
    const bootstrapRecord = bootstrapPhaseRecord(
      createInitialTurnPhaseStatuses(),
      resumedFromCrash,
      lockAcquiredAt
    );
    const phaseStatuses = bootstrapRecord.statuses;
    phaseStatusesForFailure = phaseStatuses;
    // Per-phase Mongo round-trip counts start from zero every turn; runPhase
    // checks each phase against src/simulation/engine/turnPhaseBudgets.ts.
    resetRoundTripCounts();
    currentPhaseRef.current = "turn_bootstrap";

    const nextTurnNumber = gameState.currentTurn + 1;
    if (resumedFromCrash && resumedFromCrash.targetTurn !== nextTurnNumber) {
      throw new TurnResumeRefusedError(
        `Crash resume target ${resumedFromCrash.targetTurn} no longer matches turn ` +
          `${nextTurnNumber} after clock reconciliation; refusing to resume`
      );
    }
    await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current", isProcessing: true },
      {
        $set: {
          processingTargetTurn: nextTurnNumber,
          ...(resumedFromCrash ? {} : { processingPhase: TURN_BOOTSTRAP_PHASE }),
          processingPhaseStatuses: phaseStatuses,
          processingPhaseResults: bootstrapRecord.results,
          processingEngine: engine.selection,
          processingEngineVersion: engine.version,
          updatedAt: lockAcquiredAt,
        },
      }
    );

    // The :30 half tick moved growth, inflation and exchange rates ahead of
    // this turn for display and trading. Put them back to the start of the
    // hour so every phase reads the world it would have read without the tick
    // and the hour's step lands exactly as before (subhour/rewindHalfTick.ts).
    // A failure is not fatal: the rewind is idempotent and a stamped value
    // left in place only means that document moves half a step further.
    try {
      await withPhaseProfiling("halfTickRewind", () => rewindHalfTick(db, nextTurnNumber));
    } catch (error) {
      warnings.push(
        `Half-hour tick rewind failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Bracketed so its reads are attributable: turn setup runs before the
    // first phase, and was the largest single bucket in the round-trip profile
    // only because nothing named it.
    const context = await withPhaseProfiling("turnSetup", () =>
      buildTurnExecutionContext({
        db,
        gameState,
        config,
        engine,
        warnings,
        activeIteration,
        phaseStatuses,
        startTimeMs: startTime,
      })
    );
    // One eligibility predicate for the locked phases and the post-lock
    // reporting phases alike; see the comment on `shouldRunPhase` below.
    const phasePredicate = combinePhasePredicates(
      getSimTurnPhasePredicate(config?.simTurnPhaseMode),
      getEconomyPausePredicate(nextTurnNumber, config?.economyPauseUntilTurn),
      getSingleplayerPhasePredicate(localSingleplayer),
      getAnomalyScanCadencePredicate(gameState.currentTurn)
    );
    const independentElectionPhases = independentCountryElectionPhases();
    const createRuntime = (independent = false) =>
      createTurnPhaseRuntime({
        db,
        phaseStatuses,
        warnings,
        currentPhaseRef,
        // Empty on every normal turn. On a resume, the phases the dead holder already
        // applied, which `runPhase` skips rather than repeating.
        alreadyApplied: resumedFromCrash?.appliedPhases,
        resumed: resumedFromCrash?.phaseState,
        // SIM-ONLY: sandbox worldsim can set gameConfig.simTurnPhaseMode to skip
        // the economy phases. Undefined in prod (config?.simTurnPhaseMode absent) →
        // full turn, unchanged.
        // A live world can schedule the same econ/political boundary for a timed
        // window with gameConfig.economyPauseUntilTurn (economyPause.ts): economy
        // phases are skipped strictly below that turn and the turn itself resumes
        // them. Absent or finished → undefined, no filtering.
        // Singleplayer skips the anti-abuse scans: one account with cheat
        // commands available by design has no one to defraud, and the scans were
        // ~18% of every document a turn deserializes. Composed with the sim
        // profile predicate so a headless sim run keeps its own filtering.
        // In a shared world the same scans run on a cadence instead of every
        // turn; their rolling windows make that lossless.
        shouldRunPhase: phasePredicate,
        ...(independent
          ? {
              blockedByFailure: (name: string) =>
                !isIndependentPoliticalPhase(name) && !independentElectionPhases.has(name),
            }
          : {}),
        // Audit traceId convention "turn:<n>:<phase>" (forensics plan §3.1, T2.7).
        turn: nextTurnNumber,
        onPhaseCompleted: options.onPhaseCompleted,
      });
    const runtime = createRuntime();
    phaseRuntimeForFailure = runtime;

    activeTurn = context.newTurn;
    activeCurrentYear = context.currentYear;
    activeGameNow = context.gameNow;
    phaseResultsForFailure = context.phaseResults;

    emit({
      type: "turn_start",
      payload: { turn: context.newTurn },
      timestamp: new Date().toISOString(),
    });

    // Ledger entries emitted by the phases land in this turn without a clock read.
    await runWithLedgerTurn(context.newTurn, async () => {
      await executeTurnAdapters({
        adapters: getTurnPhaseRegistry(),
        context,
        runtime,
        createIndependentRuntime: () => createRuntime(true),
        currentPhaseRef,
      });
    });
    // A timed-out phase can still be writing. Nothing after this line
    // may run, and the lock may not be released, until it has stopped.
    await runtime.drainTimedOutPhases?.();

    // Reconciles, never throws. `federalBudget.surplus` and `debt.principal` are
    // caches of an expression, and both drift intra-year on the live world even
    // though every writer maintains them on its own write. This used to only log
    // the drift, which was wrong: the stored `surplus` gates treasury transfers
    // against the debt ceiling and sizes sovereign bond issuance, so a stale cache
    // is wrong money rather than noise. Runs HERE, after every phase, because live
    // `updatedAt` values show budget writes landing well after the corporation
    // phase that recomputes them. See lib/budget/budgetInvariants.
    if (!localSingleplayer) {
      await reconcileFederalBudgetInvariants(db, context.newTurn);
    }

    const completion = completedTurnStatus(
      warnings,
      phaseStatuses,
      resumedFromCrash?.interruptedMoneyMoving ?? []
    );
    const marketUpdateAt = completedMarketUpdateAt(phaseStatuses);
    const compactPhaseTimings = Object.entries(phaseStatuses)
      .flatMap(([phase, status]) => {
        if (!status.startedAt || !status.completedAt) return [];
        return [{ phase, durationMs: status.completedAt.getTime() - status.startedAt.getTime() }];
      })
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);
    const completionWrite = await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current", ...turnLockFenceFilter() },
      {
        $set: {
          currentTurn: context.newTurn,
          currentYear: context.currentYear,
          lastTurnProcessed: context.gameNow,
          ...(marketUpdateAt ? { lastMarketTickAt: marketUpdateAt } : {}),
          // Local worlds are player-paced. A browser timer may request a turn,
          // but no server cron owns one, so never render a deceptive deadline.
          nextScheduledTurn: localSingleplayer
            ? null
            : gameState.isActive
              ? context.nextTurnTime
              : null,
          isProcessing: false,
          processingKind: null,
          processingStartedAt: null,
          processingTargetTurn: null,
          processingHeartbeatAt: null,
          processingPhase: null,
          processingPhaseStatuses: null,
          processingPhaseResults: null,
          processingEngine: null,
          processingEngineVersion: null,
          updatedAt: context.realNow,
          ...(localSingleplayer
            ? {
                singleplayerTurnMetrics: {
                  turn: context.newTurn,
                  durationMs: Date.now() - startTime,
                  success: completion.success,
                  warningCount: completion.warningCount,
                  slowestPhases: compactPhaseTimings,
                },
              }
            : {}),
        },
      }
    );
    if (turnLockFenceActive() && completionWrite.matchedCount === 0) {
      throw new TurnLockLostError("completion write found the lock gone");
    }
    localTurnLockHeld = false;
    markServerTurnAnalyticsCommitted({ emit: !localSingleplayer && config?.simSandbox !== true });

    invalidateGameTimeCache();
    invalidateGameStateCache();

    const turnLog: Omit<TurnLog, "_id"> = {
      turn: context.newTurn,
      year: context.currentYear,
      ...(activeIteration ? { iteration: activeIteration } : {}),
      gameTime: context.gameNow,
      realTime: context.realNow,
      durationMs: Date.now() - startTime,
      success: completion.success,
      outcome: completion.outcome,
      stepAccounting: completion.stepAccounting,
      ...(completion.incompleteSteps.length > 0
        ? { incompleteSteps: completion.incompleteSteps }
        : {}),
      failedPhases: completion.failedPhases,
      abortedPhases: completion.abortedPhases,
      memory: readMemoryPeak(),
      warnings,
      health: lastHealth,
      phaseStatuses,
      phases: context.phaseResults,
      // Which engine produced this world, independent of which commit deployed it.
      turnEngine: engine.selection,
      engineVersion: engine.version,
      ...(engine.v2Phases.length > 0 ? { v2Phases: [...engine.v2Phases] } : {}),
      ...(turnBuild ? { build: { ...turnBuild, engineVersion: engine.version } } : {}),
      nppEngineVersion: NPP_ENGINE_VERSION,
      createdAt: context.realNow,
    };
    let turnLogId: TurnLog["_id"] | null = null;
    if (!localSingleplayer) {
      turnLogId = (await turnLogsCollection(db).insertOne(turnLog as TurnLog)).insertedId;
      turnLogWritten = true;
      // Weekly contests read the committed turn's values; never blocks the turn.
      void runContestsAfterTurn(db, context.newTurn);
      // Suggestions marked done by any tool get their Discord post here.
      void announcePendingSuggestionCompletions(db).catch((err) =>
        console.warn("[post-turn] suggestion completion announcements failed", err)
      );
    }

    // Lock already released. Reporting phases that only write history for
    // charts, rankings and diagnostics run here, stamped with the turn they
    // describe, and complete before returning so the next turn cannot start
    // ahead of them. Never throws: a committed turn must not hit the failure
    // path.
    const reporting = await runCommittedTurnReporting({
      context,
      committedDurationMs: turnLog.durationMs,
      shouldRunPhase: phasePredicate,
      onPhaseCompleted: options.onPhaseCompleted,
      turnLogId,
    });
    healthSnapshotWritten = reporting.healthWritten;
    lastHealth = reporting.health;
    if (!localSingleplayer) {
      // Anti-abuse scans run after commit so they never hold up the turn;
      // started after reporting because the suspect scan reads this turn's
      // portfolio history. Results land on the turn log under postTurnScans.
      void runPostTurnIntegrityScans(db, context.newTurn).catch((err) =>
        console.warn("[post-turn] integrity scans failed to start", err)
      );
    }

    emit({
      type: "turn_complete",
      payload: { turn: context.newTurn, warnings: warnings.length },
      timestamp: context.realNow.toISOString(),
    });

    const warningsSuffix = warnings.length > 0 ? ` (${warnings.length} warning(s))` : "";
    const nppActions = context.phaseResults.nppActionProcessing;
    const nppSuffix = nppActions
      ? `, NPP actions: ${nppActions.actionsExecuted}/${nppActions.nppsProcessed} (build:${nppActions.buildDonorBase} camp:${nppActions.campaign} adv:${nppActions.advertise} donate:${nppActions.partyDonation} skip:${nppActions.skipped})`
      : "";
    // Per-phase Mongo round-trip profile (AHD_TURN_ROUNDTRIP_PROFILE=1).
    // Turn cost on production is round-trip bound, so this ranks phases by
    // the thing that actually costs, not by local wall clock.
    const roundTripProfile = formatRoundTripReport();
    if (roundTripProfile) {
      console.log(roundTripProfile);
      // Singleplayer writes no turnLog, so under the profiler also print the
      // per-phase wall clock the log would have carried, slowest first.
      const timingRows = Object.entries(phaseStatuses)
        .flatMap(([phase, status]) =>
          status.startedAt && status.completedAt
            ? [
                {
                  phase,
                  ms: status.completedAt.getTime() - status.startedAt.getTime(),
                  trips: status.roundTrips ?? 0,
                },
              ]
            : []
        )
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 30);
      console.log(
        `[phase-timings] slowest phases this turn (ms, round trips):\n` +
          timingRows
            .map((r) => `  ${String(r.ms).padStart(7)} ${String(r.trips).padStart(6)}  ${r.phase}`)
            .join("\n")
      );
    }
    console.log(
      `[Turn] #${context.newTurn} - ${context.characters.length} chars, $${context.phaseResults.fundGeneration?.totalGenerated?.toLocaleString() ?? "?"} generated, ${context.phaseResults.partyActions?.totalActionsGenerated ?? "?"} party actions generated, ${context.phaseResults.campaignTurn?.campaignsProcessed ?? "?"} campaigns ($${context.phaseResults.campaignTurn?.totalFundsGenerated?.toLocaleString() ?? "?"} funds, ${context.phaseResults.campaignTurn?.totalActionsGenerated ?? "?"} actions), ${context.phaseResults.partyElections?.stateElectionsCompleted ?? "?"} state elections completed${nppSuffix}${warningsSuffix}`
    );

    const durationMs = Date.now() - startTime;
    console.info("[Turn] Completed", {
      turn: context.newTurn,
      durationMs,
      mongoRoundTrips: totalRoundTrips(),
      characters: context.characters.length,
      warnings: warnings.length,
      fundsGenerated: context.phaseResults.fundGeneration?.totalGenerated ?? 0,
      campaignsProcessed: context.phaseResults.campaignTurn?.campaignsProcessed ?? 0,
      electionsCompleted: context.phaseResults.partyElections?.stateElectionsCompleted ?? 0,
    });

    if (!localSingleplayer) {
      void publishPlatformEvent({
        type: "turn:completed",
        source: "ahd",
        id: `ahd:turn:${context.newTurn}:completed`,
        occurredAt: context.realNow.toISOString(),
        payload: { turn: context.newTurn, durationMs, warnings: warnings.length },
      });
      // Analytics begins only after the committed turn and never holds up its caller.
      if (config?.simSandbox !== true) {
        void captureTurnPosthog({
          db,
          turn: context.newTurn,
          iteration: activeIteration,
          durationMs,
          phaseStatuses,
          errorCount: lastHealth?.errorCount ?? 0,
        }).catch((error) => console.warn("[PostHog] Turn telemetry failed", error));
      }
    }

    return {
      success: completion.success,
      turn: context.newTurn,
      message: !completion.success
        ? `Turn ${context.newTurn} committed INCOMPLETE: ${completion.incompleteSteps.join(", ")} did not run to completion.`
        : warnings.length === 0
          ? `Turn ${context.newTurn} processed successfully. ${context.characters.length} characters received action points.`
          : `Turn ${context.newTurn} processed with ${warnings.length} warning(s). ${context.characters.length} characters received action points.`,
      warnings,
      health: lastHealth,
    };
  } catch (error) {
    console.error("[Turn System] Critical error processing turn:", error);
    Sentry.captureException(error, { level: "fatal", tags: { component: "turnSystem" } });
    const failureTime = new Date();
    // Another process owns the turn now: write nothing about it, retry nothing.
    const lockLost = error instanceof TurnLockLostError;
    const failureMessage =
      error instanceof Error ? error.message : "Unknown error during turn processing";
    const failureDetail = describeTurnError(error);

    if (!warnings.some((warning) => warning === `turnSystem: ${failureMessage}`)) {
      warnings.push(`turnSystem: ${failureMessage}`);
    }

    try {
      // Releasing the lock while a timed-out phase is still writing would let
      // the next turn run against its writes.
      await phaseRuntimeForFailure?.drainTimedOutPhases?.();
      const db = await getDb();
      const finalizedPhaseStatuses = phaseStatusesForFailure
        ? finalizeAbortedPhaseStatuses(
            phaseStatusesForFailure,
            currentPhaseRef.current,
            failureTime,
            failureMessage
          )
        : null;

      // A fail-closed resume stop keeps the lock held and marked abandoned, with
      // its evidence, so the next attempt resumes and stops again instead of
      // rerunning the turn from scratch over committed writes.
      const holdForRepair = isResumeFailClosedError(error);
      const committedPhase =
        currentPhaseRef.current && currentPhaseRef.current !== TURN_BOOTSTRAP_PHASE
          ? currentPhaseRef.current
          : (resumedFromCrash?.lastPhase ?? currentPhaseRef.current);
      const failedTarget = resumedFromCrash?.targetTurn ?? (activeTurn > 0 ? activeTurn : null);
      // Only overwrite evidence with values this attempt actually has. A failure
      // before setup (no statuses, no target yet) must not null out what the
      // previous holder left, or the next attempt would rerun applied phases.
      const failureRecord = {
        turn: failedTarget,
        message: failureDetail,
        at: failureTime,
      };
      const evidence = {
        ...(holdForRepair
          ? committedPhase
            ? { processingPhase: committedPhase }
            : {}
          : currentPhaseRef.current
            ? { processingPhase: currentPhaseRef.current }
            : {}),
        ...(failedTarget != null ? { processingTargetTurn: failedTarget } : {}),
        ...(finalizedPhaseStatuses ? { processingPhaseStatuses: finalizedPhaseStatuses } : {}),
      };
      await (
        await getGameStateCollection(db)
      ).updateOne(
        { _id: "current", ...turnLockFenceFilter() },
        {
          $set: holdForRepair
            ? {
                isProcessing: true,
                processingKind: "turn",
                processingHeartbeatAt: failureTime,
                processingAbandonedAt: failureTime,
                ...evidence,
                lastTurnFailure: failureRecord,
                updatedAt: failureTime,
              }
            : {
                isProcessing: false,
                processingKind: null,
                processingHeartbeatAt: failureTime,
                ...evidence,
                lastTurnFailure: failureRecord,
                updatedAt: failureTime,
              },
        }
      );
      localTurnLockHeld = false;

      if (
        !isSingleplayer() &&
        !lockLost &&
        finalizedPhaseStatuses &&
        phaseResultsForFailure &&
        activeTurn > 0 &&
        !healthSnapshotWritten
      ) {
        try {
          const crashHealth = await processGameHealthSnapshot(
            db,
            activeTurn,
            activeCurrentYear,
            Date.now() - startTime,
            false,
            [...warnings],
            finalizedPhaseStatuses
          );
          lastHealth = crashHealth.health;
          healthSnapshotWritten = crashHealth.snapshotWritten;
        } catch (snapshotError) {
          console.warn("[Turn] Failed to persist crash health snapshot", snapshotError);
          Sentry.captureException(snapshotError, {
            extra: { component: "turnCrashHealthSnapshot", turn: activeTurn },
          });
        }
      }

      if (
        !isSingleplayer() &&
        !lockLost &&
        finalizedPhaseStatuses &&
        phaseResultsForFailure &&
        activeTurn > 0 &&
        !turnLogWritten
      ) {
        const crashTurnLog: Omit<TurnLog, "_id"> = {
          turn: activeTurn,
          year: activeCurrentYear,
          ...(activeIteration ? { iteration: activeIteration } : {}),
          gameTime: activeGameNow ?? failureTime,
          realTime: failureTime,
          durationMs: Date.now() - startTime,
          success: false,
          error: failureDetail,
          memory: readMemoryPeak(),
          warnings: [...warnings],
          health: lastHealth,
          phaseStatuses: finalizedPhaseStatuses,
          phases: phaseResultsForFailure,
          ...(activeEngine
            ? {
                turnEngine: activeEngine.selection,
                engineVersion: activeEngine.version,
                ...(activeEngine.v2Phases.length > 0
                  ? { v2Phases: [...activeEngine.v2Phases] }
                  : {}),
                ...(turnBuild
                  ? { build: { ...turnBuild, engineVersion: activeEngine.version } }
                  : {}),
              }
            : {}),
          createdAt: failureTime,
        };
        await turnLogsCollection(db).insertOne(crashTurnLog as TurnLog);
      }
    } catch (releaseError) {
      // A failed release is reclaimed by the 20-min stale takeover, but
      // surface it rather than swallow: a silently-stranded lock wedges turns.
      // Do NOT clear localTurnLockHeld, so graceful shutdown can retry.
      console.error("[Turn System] Failed to release lock after turn error:", releaseError);
      Sentry.captureException(releaseError, {
        tags: { component: "turnSystem", op: "lockReleaseAfterError" },
      });
    }

    if (!isSingleplayer() && !lockLost) {
      void publishPlatformEvent({
        type: "turn:failed",
        source: "ahd",
        id: `ahd:turn:${activeTurn || "unknown"}:failed:${failureTime.getTime()}`,
        occurredAt: failureTime.toISOString(),
        payload: {
          turn: activeTurn || null,
          phase: currentPhaseRef.current,
          message: failureMessage,
        },
      });
    }

    return {
      success: false,
      turn: 0,
      message: `Failed to process turn: ${error instanceof Error ? error.message : "Unknown error"}`,
      warnings,
      health: lastHealth,
      failure: {
        phase:
          error instanceof TurnMustStopError
            ? error.phase
            : currentPhaseRef.current && currentPhaseRef.current !== TURN_BOOTSTRAP_PHASE
              ? currentPhaseRef.current
              : null,
        target: resumedFromCrash?.targetTurn ?? (activeTurn > 0 ? activeTurn : null),
        retryable:
          resilienceStage >= 1 &&
          !lockLost &&
          !(
            currentPhaseRef.current != null &&
            phaseBlocksResumeWhenInterrupted(currentPhaseRef.current) &&
            !(error instanceof TurnMustStopError)
          ) &&
          (phasesStarted(currentPhaseRef.current) ||
            !(
              error instanceof TurnResumeRefusedError ||
              error instanceof TurnResumeResultUnavailableError
            )),
      },
    };
  } finally {
    setTurnLockFence(null);
    readMemoryPeak();
  }
}

export async function startTurnSystem(): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDb();
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { lastReset: 1 } }
    );
    const residueRefusal = resetResidueTurnRefusal(config?.lastReset);
    if (residueRefusal) return { success: false, message: residueRefusal };
    const now = new Date();
    const nextHour = nextScheduledTurnAfter(now, resolveTurnCronMinute());

    // Deadlines are turn-based, so resuming after a pause needs no Date-shift:
    // frozen turns kept every countdown frozen. (Phase 5 removed shiftDeadlinesOnResume.)
    await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current" },
      {
        $set: {
          isActive: true,
          nextScheduledTurn: nextHour,
          pausedAt: null,
          pauseReason: null,
          pauseKind: null,
          lastResumedAt: now,
          updatedAt: now,
        },
      }
    );

    invalidateGameStateCache();
    console.log(`[Turn System] Started. Next turn at ${nextHour.toISOString()}`);
    return {
      success: true,
      message: `Turn system started. Next turn at ${nextHour.toLocaleTimeString()}.`,
    };
  } catch (error) {
    console.error("[Turn System] Error starting:", error);
    Sentry.captureException(error, { tags: { component: "turnSystem", op: "start" } });
    return {
      success: false,
      message: `Failed to start: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function stopTurnSystem(): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDb();
    const now = new Date();
    await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current" },
      {
        $set: {
          isActive: false,
          nextScheduledTurn: null,
          pausedAt: now,
          pauseReason: "Paused by admin",
          pauseKind: "manual",
          updatedAt: now,
        },
      }
    );
    invalidateGameStateCache();
    console.log("[Turn System] Stopped at", now.toISOString());
    return { success: true, message: "Turn system stopped successfully. Election timers paused." };
  } catch (error) {
    console.error("[Turn System] Error stopping:", error);
    Sentry.captureException(error, { tags: { component: "turnSystem", op: "stop" } });
    return {
      success: false,
      message: `Failed to stop: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ─── Fast mode toggle ─────────────────────────────────────────────────────────

export async function toggleFastMode(): Promise<{
  success: boolean;
  message: string;
  fastMode: boolean;
}> {
  try {
    const db = await getDb();
    const gameState = await getGameState(db);

    if (!gameState) {
      return { success: false, message: "Game state not found", fastMode: false };
    }

    const newFastModeState = !gameState.fastMode;

    await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current" },
      { $set: { fastMode: newFastModeState, updatedAt: new Date() } }
    );

    invalidateGameStateCache();

    // Rebuild the schedule if this process owns it; otherwise the worker must restart.
    const { restartCronWithSchedule } = await import("./cron");
    const restarted = await restartCronWithSchedule();

    console.log(`[Turn System] Fast mode ${newFastModeState ? "enabled" : "disabled"}`);
    return {
      success: true,
      message:
        `Fast mode ${newFastModeState ? "enabled" : "disabled"}. Turns will run ${newFastModeState ? "every 30 minutes" : "every hour"}` +
        (restarted ? "." : " once the turn worker restarts."),
      fastMode: newFastModeState,
    };
  } catch (error) {
    console.error("[Turn System] Error toggling fast mode:", error);
    Sentry.captureException(error, { tags: { component: "turnSystem", op: "toggleFastMode" } });
    return {
      success: false,
      message: `Failed to toggle fast mode: ${error instanceof Error ? error.message : "Unknown error"}`,
      fastMode: false,
    };
  }
}

// Keep ObjectId in scope for any callers that import it via turnSystem
export { ObjectId };
