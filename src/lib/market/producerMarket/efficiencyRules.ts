/**
 * Organisational efficiency as a physical effect: same points become
 * productivity, not margin, so nothing is created from nothing.
 * An off-type plant or badly run state company makes less from the same
 * workers and materials; an own-type plant makes a little more. Costs are
 * unchanged, so the effect shows only through what it sells.
 *
 * Pure: no database, clock or ambient state.
 */

/** Points of efficiency (positive = more output). Clamped so output never goes below a floor. */
export const ORGANISATIONAL_EFFICIENCY_MIN_FACTOR = 0.5;

export function organisationalOutputFactor(args: {
  /** Type match points: +own type, +secondary, -off type (0 for state companies). */
  typeMatchPp: number;
  /** State-company efficiency points (<= 0; 0 for private companies). */
  soeEfficiencyPp: number;
  /**
   * Where the plant is and what it knows: the state-metric profile (grid,
   * skills, crime, roads, broadband...), regional conditions and the tech
   * tree's margin bonus. Real conditions change output per worker.
   */
  regionalPp?: number;
}): number {
  const finite = (x: number | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const pp =
    finite(args.typeMatchPp) + Math.min(0, finite(args.soeEfficiencyPp)) + finite(args.regionalPp);
  return Math.max(ORGANISATIONAL_EFFICIENCY_MIN_FACTOR, 1 + pp / 100);
}
