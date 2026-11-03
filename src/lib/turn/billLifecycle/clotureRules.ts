/**
 * Cloture rule for a filibustered bill: 3/5 of the votes cast (for, against
 * and abstain together) must be "for". Pure, so docs and charts share it.
 */
export const CLOTURE_VOTE_SHARE = 3 / 5;

/** For votes needed to pass a filibustered bill given the votes cast. */
export function clotureVotesRequired(votesCast: number): number {
  return Math.ceil(CLOTURE_VOTE_SHARE * votesCast);
}
