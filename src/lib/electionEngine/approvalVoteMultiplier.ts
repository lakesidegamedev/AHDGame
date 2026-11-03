/**
 * How government approval reweights a vote pool. Plain data in, plain data out.
 *
 * Approval is centred at 50% (no change). The multiplier swings by the slope
 * times half the approval range, so the higher presidential slope moves a
 * pool further than the legislative one.
 */

/** Slope of the vote pool multiplier for presidential elections. */
export const PRESIDENTIAL_APPROVAL_VOTE_SLOPE = 0.5;
/** Slope of the vote pool multiplier for legislative elections. */
export const LEGISLATIVE_APPROVAL_VOTE_SLOPE = 0.2;

/** Vote pool multiplier for an approval rating given as a 0 to 1 decimal. */
export function approvalVoteMultiplier(approvalDecimal: number, slope: number): number {
  return 1 + (approvalDecimal - 0.5) * slope;
}
