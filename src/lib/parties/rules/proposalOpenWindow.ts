/**
 * Every committee proposal stays open for a minimum time so the whole
 * committee, and anyone it affects, can see it and answer before it can pass.
 * Measured in real time, not turns, because turns can be advanced faster than
 * one an hour.
 */

export const PROPOSAL_MIN_OPEN_MS = 24 * 60 * 60 * 1000;

/** Epoch milliseconds from which a proposal created at `createdAtMs` may pass. */
export function proposalEarliestPassMs(createdAtMs: number): number {
  return createdAtMs + PROPOSAL_MIN_OPEN_MS;
}

export function proposalMayPass(createdAtMs: number, nowMs: number): boolean {
  return nowMs >= proposalEarliestPassMs(createdAtMs);
}

export type ProposalOutcome = "passed" | "rejected" | "open";

/**
 * Holds a passing proposal open until its minimum window has elapsed.
 * Rejections are not held: a proposal that can no longer reach the threshold
 * closes at once.
 */
export function holdUntilMinimumOpen(
  outcome: ProposalOutcome,
  createdAtMs: number,
  nowMs: number
): ProposalOutcome {
  if (outcome === "passed" && !proposalMayPass(createdAtMs, nowMs)) return "open";
  return outcome;
}
