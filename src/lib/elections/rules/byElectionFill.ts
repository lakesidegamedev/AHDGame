/**
 * Fill guarantee for by-elections: a race whose filing window is about to close
 * with nobody standing gets one candidate from the seat's previous party, so the
 * seat does not stay empty for another retry cycle.
 */

/** Turns before the filing window closes at which an empty race gets its fallback candidate. */
export const BY_ELECTION_FILL_LEAD_TURNS = 2;

export function needsFillCandidate(input: {
  activeCandidateCount: number;
  primaryEndTurn: number;
  currentTurn: number;
}): boolean {
  if (input.activeCandidateCount > 0) return false;
  if (input.currentTurn >= input.primaryEndTurn) return false;
  return input.currentTurn >= input.primaryEndTurn - BY_ELECTION_FILL_LEAD_TURNS;
}

/**
 * The party that fields the fallback candidate: the seat's previous party when
 * it may field one, else the first eligible party (callers order eligible parties
 * with the largest first). Null when no party can field.
 */
export function pickFillParty(
  previousParty: string | null | undefined,
  eligibleParties: readonly string[]
): string | null {
  if (previousParty && eligibleParties.includes(previousParty)) return previousParty;
  return eligibleParties[0] ?? null;
}
