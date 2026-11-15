/**
 * Rules for automatic retry of a stopped turn. Plain data in, plain data out.
 */

/** Wait before each automatic attempt: about 1, 3 and 9 minutes. */
export const TURN_RETRY_DELAYS_MS: readonly number[] = [60_000, 180_000, 540_000];

export type TurnFailureInfo = {
  /** Step the attempt was in when it stopped, if any. */
  phase: string | null;
  /** The target turn, when the attempt got far enough to know it. */
  target: number | null;
  /** Set by the turn when a retry through the resume path is worth trying. */
  retryable: boolean;
};

export type RetryState = { key: string | null; attempts: number };

export type RetryDecision =
  | { action: "retry"; attempt: number; delayMs: number; state: RetryState }
  | { action: "stop"; reason: "not-retryable" | "exhausted"; attempts: number; state: RetryState }
  | { action: "idle"; state: RetryState };

const EMPTY: RetryState = { key: null, attempts: 0 };

/** Decide what a finished attempt means for the retry loop. */
export function decideTurnRetry(
  state: RetryState,
  outcome: { success: boolean; failure?: TurnFailureInfo | null }
): RetryDecision {
  if (outcome.success) return { action: "idle", state: EMPTY };
  const failure = outcome.failure;
  if (!failure) return { action: "idle", state };
  const key = failure.target != null ? String(failure.target) : "unknown";
  const prior = state.key === key ? state.attempts : 0;
  if (!failure.retryable) {
    return { action: "stop", reason: "not-retryable", attempts: prior, state: EMPTY };
  }
  if (prior >= TURN_RETRY_DELAYS_MS.length) {
    return { action: "stop", reason: "exhausted", attempts: prior, state: EMPTY };
  }
  return {
    action: "retry",
    attempt: prior + 1,
    delayMs: TURN_RETRY_DELAYS_MS[prior],
    state: { key, attempts: prior + 1 },
  };
}
