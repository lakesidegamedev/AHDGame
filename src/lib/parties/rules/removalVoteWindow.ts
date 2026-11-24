/**
 * A committee vote to remove an office holder stays open for a minimum time
 * so the target and the whole committee can see it and answer before it can
 * pass. Measured in real time, not turns, because turns can be advanced
 * faster than one an hour.
 */

export const REMOVAL_VOTE_MIN_OPEN_MS = 24 * 60 * 60 * 1000;

/** Epoch milliseconds from which a removal vote created at `createdAtMs` may pass. */
export function removalVoteEarliestPassMs(createdAtMs: number): number {
  return createdAtMs + REMOVAL_VOTE_MIN_OPEN_MS;
}

export function removalVoteMayPass(createdAtMs: number, nowMs: number): boolean {
  return nowMs >= removalVoteEarliestPassMs(createdAtMs);
}

export type ProposalOutcome = "passed" | "rejected" | "open";

/**
 * Holds a passing removal vote open until its minimum window has elapsed.
 * Rejections are not held: a vote that can no longer reach the threshold
 * closes at once, which only ever protects the target.
 */
export function holdRemovalUntilWindow(
  outcome: ProposalOutcome,
  createdAtMs: number,
  nowMs: number
): ProposalOutcome {
  if (outcome === "passed" && !removalVoteMayPass(createdAtMs, nowMs)) return "open";
  return outcome;
}
