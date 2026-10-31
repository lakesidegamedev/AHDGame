import type { ObjectId } from "mongodb";
import * as Sentry from "@sentry/nextjs";
import type { GameHealthSummary, TurnLog } from "@/lib/db/types";
import { postLockTurnLogUpdate, runPostLockReporting } from "@/simulation/engine/postLockReporting";
import type {
  CompletedTurnPhaseObservation,
  TurnExecutionContext,
} from "@/simulation/engine/types";
import { postLockReportingSteps } from "@/simulation/phases/postLockReportingPhases";

export interface CommittedTurnReporting {
  /** The health grade the post-lock health snapshot produced, if it ran. */
  health: GameHealthSummary | null;
  healthWritten: boolean;
}

/**
 * Run the post-lock reporting phases for a turn that has just committed, and
 * merge their timings and results into its turn log. Called by the turn
 * processor after the lock is released. Never throws: any failure is logged
 * and reported, and the committed turn stands.
 */
export async function runCommittedTurnReporting(input: {
  context: TurnExecutionContext;
  committedDurationMs: number;
  shouldRunPhase?: (phaseName: string) => boolean;
  onPhaseCompleted?: (phase: CompletedTurnPhaseObservation) => Promise<void>;
  /** The turn's log, when one was written (never in singleplayer). */
  turnLogId: ObjectId | null;
}): Promise<CommittedTurnReporting> {
  const { context, turnLogId } = input;
  try {
    const outcome = await runPostLockReporting({
      context,
      committedDurationMs: input.committedDurationMs,
      steps: postLockReportingSteps,
      shouldRunPhase: input.shouldRunPhase,
      onPhaseCompleted: input.onPhaseCompleted,
    });
    const healthResult = outcome.phaseResults.gameHealthSnapshot ?? null;
    const health = healthResult?.health ?? null;
    if (turnLogId) {
      await context.db
        .collection<TurnLog>("turnLogs")
        .updateOne(
          { _id: turnLogId },
          { $set: { ...postLockTurnLogUpdate(outcome), ...(health ? { health } : {}) } }
        );
    }
    return { health, healthWritten: healthResult?.snapshotWritten === true };
  } catch (error) {
    console.error(`[post-lock] reporting for turn ${context.newTurn} failed`, error);
    Sentry.captureException(error, {
      extra: { component: "postLockReporting", turn: context.newTurn },
    });
    return { health: null, healthWritten: false };
  }
}
