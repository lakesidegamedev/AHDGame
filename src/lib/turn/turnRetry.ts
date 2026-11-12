import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/observability/logger";
import {
  TURN_RETRY_DELAYS_MS,
  decideTurnRetry,
  type RetryState,
  type TurnFailureInfo,
} from "@/lib/turn/rules/retryPolicy";

export type TurnRetryAttempt = { attempt: number; of: number; afterPhase: string | null };

export type TurnRetryResult = { success: boolean; failure?: TurnFailureInfo | null };

export type TurnRetryRecord = {
  turn: number | null;
  attempt: number;
  afterPhase: string | null;
  outcome: "scheduled" | "succeeded" | "failed" | "stopped" | "exhausted";
  at: Date;
  note?: string;
};

/**
 * Re-runs a stopped turn without waiting for the next hourly slot. Each attempt
 * is an ordinary turn call, which resumes through the existing crash-resume path
 * (completed steps skipped), so a step that is not safe to rerun still refuses
 * and the loop stops and alerts instead of repeating. Every wait is a plain
 * timer that always fires.
 */
export function createTurnRetryController(deps: {
  run: (attempt: TurnRetryAttempt) => Promise<TurnRetryResult>;
  record: (entry: TurnRetryRecord) => Promise<void> | void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  alert?: (message: string, extra: Record<string, unknown>) => void;
}) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const alert =
    deps.alert ??
    ((message, extra) => {
      Sentry.captureMessage(message, {
        level: "fatal",
        fingerprint: ["turn-auto-retry-stopped"],
        extra,
      });
    });
  let state: RetryState = { key: null, attempts: 0 };
  let pending = false;
  let lastAttempt: TurnRetryAttempt | null = null;

  const safeRecord = async (entry: TurnRetryRecord) => {
    try {
      await deps.record(entry);
    } catch (err) {
      logger.warn("Turn Retry", "Failed to record retry entry", { error: String(err) });
    }
  };

  async function onResult(result: TurnRetryResult): Promise<void> {
    const ran = lastAttempt;
    lastAttempt = null;
    const target = result.failure?.target ?? null;
    if (ran) {
      await safeRecord({
        turn: target,
        attempt: ran.attempt,
        afterPhase: ran.afterPhase,
        outcome: result.success ? "succeeded" : "failed",
        at: new Date(),
      });
    }
    if (pending) return;
    const decision = decideTurnRetry(state, result);
    state = decision.state;
    if (decision.action === "idle") return;
    if (decision.action === "stop") {
      if (decision.attempts > 0 || decision.reason === "exhausted") {
        const message =
          decision.reason === "exhausted"
            ? `Turn ${target ?? "?"} still failing after ${decision.attempts} automatic retries; stopped with evidence kept.`
            : `Turn ${target ?? "?"} cannot be retried safely (step ${result.failure?.phase ?? "?"}); stopped with evidence kept.`;
        logger.warn("Turn Retry", message);
        alert(message, { turn: target, phase: result.failure?.phase ?? null });
        await safeRecord({
          turn: target,
          attempt: decision.attempts,
          afterPhase: result.failure?.phase ?? null,
          outcome: decision.reason === "exhausted" ? "exhausted" : "stopped",
          at: new Date(),
          note: message,
        });
      }
      return;
    }
    const attempt: TurnRetryAttempt = {
      attempt: decision.attempt,
      of: TURN_RETRY_DELAYS_MS.length,
      afterPhase: result.failure?.phase ?? null,
    };
    pending = true;
    logger.warn(
      "Turn Retry",
      `Turn ${target ?? "?"} stopped at ${attempt.afterPhase ?? "setup"}; attempt ${attempt.attempt} of ${attempt.of} in ${Math.round(decision.delayMs / 1000)}s.`
    );
    await safeRecord({
      turn: target,
      attempt: attempt.attempt,
      afterPhase: attempt.afterPhase,
      outcome: "scheduled",
      at: new Date(),
    });
    setTimer(() => {
      pending = false;
      lastAttempt = attempt;
      deps
        .run(attempt)
        .then((r) => onResult(r))
        .catch((err) =>
          onResult({
            success: false,
            failure: { phase: attempt.afterPhase, target, retryable: true },
          }).finally(() => logger.error("Turn Retry", "Attempt threw", err))
        );
    }, decision.delayMs);
  }

  return { onResult };
}
