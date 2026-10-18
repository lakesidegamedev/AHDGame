/**
 * Next turn's reference price from this turn's settled market (market recovery
 * plan, phases 4 and 6). A price answers to what actually happened, not to a
 * memory of past shortages:
 *
 * - funded buyers went short at the price -> it rises;
 * - sellers were left holding stock -> it falls;
 * - otherwise it moves toward the volume-weighted price trades settled at.
 *
 * The move is capped per turn (same 6% pace as the legacy glide) so a single
 * turn cannot whipsaw. Administered prices, inflation and policy apply after
 * this, outside the rule.
 *
 * Pure: last reference and this turn's book totals in, next reference out.
 */

export const REFERENCE_MAX_MOVE = 0.06;
/** How strongly a shortage or glut share moves the price before the cap. */
export const REFERENCE_IMBALANCE_GAIN = 0.5;

export interface BookOutcome {
  /** Volume-weighted settled price this turn, or null if nothing traded. */
  settledUnitPrice: number | null;
  /** Units funded buyers asked for at or above the reference and did not get. */
  unmetUnits: number;
  /** Units offered and not sold. */
  unsoldUnits: number;
  /** Units traded. */
  tradedUnits: number;
}

export function nextReferencePrice(prior: number, outcome: BookOutcome): number {
  if (!Number.isFinite(prior) || prior <= 0) throw new Error("Invalid prior reference price");
  const finite = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const traded = finite(outcome.tradedUnits);
  const unmet = finite(outcome.unmetUnits);
  const unsold = finite(outcome.unsoldUnits);
  const total = traded + unmet + unsold;
  // Imbalance in [-1, 1]: positive = short, negative = glut.
  const imbalance = total > 0 ? (unmet - unsold) / total : 0;
  const settled =
    outcome.settledUnitPrice != null &&
    Number.isFinite(outcome.settledUnitPrice) &&
    outcome.settledUnitPrice > 0
      ? outcome.settledUnitPrice
      : prior;
  const target = settled * (1 + REFERENCE_IMBALANCE_GAIN * imbalance);
  const lo = prior * (1 - REFERENCE_MAX_MOVE);
  const hi = prior * (1 + REFERENCE_MAX_MOVE);
  return Math.min(hi, Math.max(lo, target));
}
