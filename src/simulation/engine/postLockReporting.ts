import type { Db } from "mongodb";
import type { GameState, TurnLog, TurnPhaseTelemetryMap } from "@/lib/db/types";
import { createTurnPhaseRuntime } from "@/simulation/engine/turnPhaseRuntime";
import type { TurnExecutionContext, TurnPhaseRuntime } from "@/simulation/engine/types";

/**
 * Reporting phases that run after the turn commits and releases its lock.
 *
 * These phases only write their own history and snapshot records, and nothing
 * in the turn or in the next turn's simulation reads those records (see
 * `postLockReportingPhases.ts` for the per-phase reasoning). Running them
 * inside the lock only kept players waiting on routes that reject during a
 * turn. They now run in the same worker straight after the commit:
 *
 * - every phase is stamped with the turn it snapshots, passed in explicitly,
 *   never read back from `gameState`, so a late or retried run cannot land on
 *   the wrong turn;
 * - before each step the world is checked: if a newer turn has started or
 *   committed, the remaining steps are skipped and logged instead of recording
 *   the next turn's world under this turn's number;
 * - phase timings are recorded with the same telemetry as in-lock phases and
 *   merged into the turn's log, so turn diagnostics still list them.
 */

/** Turn context handed to a post-lock step, plus what only exists after the commit. */
export interface PostLockReportingContext extends TurnExecutionContext {
  /** Wall time from turn start to the commit that released the lock. */
  committedDurationMs: number;
}

export interface PostLockReportingStep {
  key: string;
  /** Every phase name the step may record, so a skipped step still lists them. */
  phases: readonly string[];
  execute(context: PostLockReportingContext, runtime: TurnPhaseRuntime): Promise<void>;
}

export interface PostLockReportingOutcome {
  turn: number;
  status: "completed" | "stopped";
  startedAt: Date;
  completedAt: Date;
  /** Why the run stopped early, when it did. */
  reason?: string;
  phaseStatuses: TurnPhaseTelemetryMap;
  phaseResults: TurnLog["phases"];
  warnings: string[];
}

export const NEWER_TURN_STARTED_MESSAGE =
  "skipped: a newer turn started before post-lock reporting";

/**
 * True while the world still sits on `turn`: committed, unlocked, not advanced.
 * A false answer means another turn holds or has moved past the world, and a
 * snapshot taken now would describe that turn instead.
 */
export async function isWorldStillOnTurn(db: Pick<Db, "collection">, turn: number) {
  const state = await db
    .collection<GameState>("gameState")
    .findOne({ _id: "current" }, { projection: { currentTurn: 1, isProcessing: 1 } });
  return state != null && state.currentTurn === turn && state.isProcessing !== true;
}

export async function runPostLockReporting(input: {
  context: TurnExecutionContext;
  committedDurationMs: number;
  steps: readonly PostLockReportingStep[];
  /** The turn's own phase eligibility (sim profiles, singleplayer, pauses). */
  shouldRunPhase?: (phaseName: string) => boolean;
  /** Sandbox tooling hook, forwarded so a phase trace still sees these phases. */
  onPhaseCompleted?: Parameters<typeof createTurnPhaseRuntime>[0]["onPhaseCompleted"];
  /** Checked before every step. Defaults to `isWorldStillOnTurn`. */
  isStillOnTurn?: () => Promise<boolean>;
  now?: () => Date;
}): Promise<PostLockReportingOutcome> {
  const { context, steps } = input;
  const now = input.now ?? (() => new Date());
  const turn = context.newTurn;
  const isStillOnTurn = input.isStillOnTurn ?? (() => isWorldStillOnTurn(context.db, turn));
  const phaseStatuses: TurnPhaseTelemetryMap = {};
  const warnings: string[] = [];
  const phaseResults = {} as TurnLog["phases"];
  const runtime = createTurnPhaseRuntime({
    db: context.db,
    phaseStatuses,
    warnings,
    currentPhaseRef: { current: null },
    turn,
    shouldRunPhase: input.shouldRunPhase,
    onPhaseCompleted: input.onPhaseCompleted,
    statusPersistence: "memory",
  });
  // The turn's own warnings and statuses stay readable (the health snapshot
  // grades them); results and failures from this run are kept apart and merged
  // into the turn log by the caller.
  const reportingContext: PostLockReportingContext = {
    ...context,
    warnings: [...context.warnings],
    phaseResults,
    committedDurationMs: input.committedDurationMs,
  };

  const startedAt = now();
  let reason: string | undefined;
  for (const [index, step] of steps.entries()) {
    let current = false;
    try {
      current = await isStillOnTurn();
    } catch (error) {
      reason = `could not confirm turn ${turn} is current: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (!current) {
      reason ??= `a newer turn started before ${step.key} ran`;
      console.warn(`[post-lock] turn ${turn}: ${reason}; skipping the remaining reporting phases`);
      for (const remaining of steps.slice(index)) {
        for (const phase of remaining.phases) {
          await runtime.markPhaseSkipped(phase, "conditional", NEWER_TURN_STARTED_MESSAGE);
        }
      }
      break;
    }
    try {
      await step.execute(reportingContext, runtime);
    } catch (error) {
      // runPhase already isolates phase failures; this only catches a step's
      // own glue code. A reporting step must never fail a committed turn.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[post-lock] turn ${turn}: ${step.key} failed: ${message}`, error);
      warnings.push(`${step.key}: ${message}`);
    }
  }

  return {
    turn,
    status: reason ? "stopped" : "completed",
    startedAt,
    completedAt: now(),
    ...(reason ? { reason } : {}),
    phaseStatuses,
    phaseResults,
    warnings,
  };
}

/**
 * Merge a post-lock run into the turn's log: per-phase statuses and results go
 * under the same keys in-lock phases use, so turn diagnostics read them the
 * same way, plus a `postLockReporting` summary of the run itself.
 */
export function postLockTurnLogUpdate(outcome: PostLockReportingOutcome): Record<string, unknown> {
  const set: Record<string, unknown> = {
    postLockReporting: {
      status: outcome.status,
      startedAt: outcome.startedAt,
      completedAt: outcome.completedAt,
      ms: outcome.completedAt.getTime() - outcome.startedAt.getTime(),
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...(outcome.warnings.length > 0 ? { warnings: outcome.warnings } : {}),
    },
  };
  for (const [phase, status] of Object.entries(outcome.phaseStatuses)) {
    set[`phaseStatuses.${phase}`] = status;
  }
  for (const [phase, result] of Object.entries(outcome.phaseResults ?? {})) {
    if (result !== undefined) set[`phases.${phase}`] = result;
  }
  return set;
}
