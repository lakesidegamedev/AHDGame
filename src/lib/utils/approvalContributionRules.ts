/**
 * Per-metric government approval contribution. Plain data in, plain data out.
 *
 * Each metric's signed deviation from the national average (as a fraction of
 * that average, flipped for "lower is better" metrics) is scaled and then
 * clamped, so no single metric can move approval by more than the cap.
 */

/** Contribution per metric: max +/-2. Scale factor for pct deviation. */
export const CONTRIBUTION_SCALE = 15;
export const MAX_CONTRIBUTION = 2;

/** Approval points one metric contributes for a signed fractional deviation. */
export function metricApprovalContribution(signedDiff: number): number {
  return Math.max(-MAX_CONTRIBUTION, Math.min(MAX_CONTRIBUTION, signedDiff * CONTRIBUTION_SCALE));
}
