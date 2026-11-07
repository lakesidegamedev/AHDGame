/**
 * Education index for the 2027 world: the share of adults with a tertiary
 * education, per region. It moves slowly because it changes only as new
 * graduates replace older adults, so it drifts a small share of the way to
 * its target every year. The target follows how many young people enter
 * higher education and how well education is funded.
 */

/** Share of the gap to target closed per year (about a generation to converge). */
export const EDUCATION_DRIFT_PER_YEAR = 1 / 25;
/** Spending response (0..100) the target is centred on. */
export const NEUTRAL_EDUCATION_SPENDING_RESPONSE = 38;
export const EDUCATION_INDEX_BOUNDS = [0, 80] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const finiteOr = (v: number | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Long-run tertiary share for a region.
 * `universityEnrollment` is the percent of young people entering higher
 * education; `spendingResponse` is the education spending channel, 0..100.
 */
export function educationIndexTarget(input: {
  universityEnrollment?: number;
  spendingResponse: number;
}): number {
  const enrollment = clamp(finiteOr(input.universityEnrollment, 45), 0, 100);
  const spending =
    clamp(finiteOr(input.spendingResponse, NEUTRAL_EDUCATION_SPENDING_RESPONSE), 0, 100) -
    NEUTRAL_EDUCATION_SPENDING_RESPONSE;
  return clamp(5 + 0.6 * enrollment + 0.25 * spending, ...EDUCATION_INDEX_BOUNDS);
}

/** Next education index. With no previous reading the region opens at its target. */
export function advanceEducationIndex(input: {
  previous: number | undefined;
  target: number;
  turnsPerYear: number;
}): number {
  const target = clamp(finiteOr(input.target, 30), ...EDUCATION_INDEX_BOUNDS);
  const previous = input.previous;
  if (!(typeof previous === "number" && Number.isFinite(previous))) return target;
  const step = 1 - Math.pow(1 - EDUCATION_DRIFT_PER_YEAR, 1 / Math.max(1, input.turnsPerYear));
  return clamp(previous + (target - previous) * step, ...EDUCATION_INDEX_BOUNDS);
}
