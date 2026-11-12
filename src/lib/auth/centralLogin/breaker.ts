/**
 * Circuit breaker state machine for the account bridge. Plain data in, plain
 * data out: the caller supplies the clock and keeps the state.
 */

export interface BreakerState {
  failures: number;
  /** 0 when closed. Calls are skipped until this instant. */
  openUntil: number;
  /** A trial call is in flight after the open window ended. */
  trialInFlight: boolean;
}

export interface BreakerConfig {
  failureThreshold: number;
  openMs: number;
}

export const DEFAULT_BREAKER_FAILURES = 5;
export const DEFAULT_BREAKER_OPEN_MS = 30_000;

export function newBreakerState(): BreakerState {
  return { failures: 0, openUntil: 0, trialInFlight: false };
}

export function parseBreakerConfig(
  failures: string | undefined,
  openMs: string | undefined
): BreakerConfig {
  const f = Number(failures);
  const o = Number(openMs);
  return {
    failureThreshold: Number.isFinite(f) && f >= 1 ? Math.floor(f) : DEFAULT_BREAKER_FAILURES,
    openMs: Number.isFinite(o) && o > 0 ? Math.floor(o) : DEFAULT_BREAKER_OPEN_MS,
  };
}

/** Decide whether a call may go out. A permitted call after the window is the single trial. */
export function breakerAdmit(state: BreakerState, now: number): "allow" | "trial" | "skip" {
  if (state.openUntil === 0) return "allow";
  if (now < state.openUntil) return "skip";
  return state.trialInFlight ? "skip" : "trial";
}

export function breakerOnAdmit(state: BreakerState, decision: "allow" | "trial" | "skip"): void {
  if (decision === "trial") state.trialInFlight = true;
}

export function breakerOnSuccess(state: BreakerState): void {
  state.failures = 0;
  state.openUntil = 0;
  state.trialInFlight = false;
}

export function breakerOnFailure(state: BreakerState, now: number, config: BreakerConfig): void {
  const wasTrial = state.trialInFlight;
  state.trialInFlight = false;
  state.failures += 1;
  if (wasTrial || state.failures >= config.failureThreshold) {
    state.openUntil = now + config.openMs;
  }
}
