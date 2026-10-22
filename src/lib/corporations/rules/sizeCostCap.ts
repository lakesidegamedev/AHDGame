/**
 * Ceiling on what size alone can take from a sector's margin (owner decision
 * 2026-10-22). Sprawl, management overhead and the dominance penalty each
 * price a different side of being big; stacked, they took 8 to 13 points off
 * the largest companies at once. Together they are capped at this many margin
 * points, each scaled down by the same factor so the breakdown still shows
 * where the cost comes from.
 *
 * Pure: the three (non-positive) margin modifiers in, the capped ones out.
 */
export const SIZE_COST_CAP_PP = 7.5;

export function capSizeCosts(input: { sprawl: number; overhead: number; dominance: number }): {
  sprawl: number;
  overhead: number;
  dominance: number;
} {
  const neg = (v: number) => (Number.isFinite(v) ? Math.min(0, v) : 0);
  const sprawl = neg(input.sprawl);
  const overhead = neg(input.overhead);
  const dominance = neg(input.dominance);
  const total = -(sprawl + overhead + dominance);
  if (!(total > SIZE_COST_CAP_PP)) return { sprawl, overhead, dominance };
  const k = SIZE_COST_CAP_PP / total;
  return { sprawl: sprawl * k, overhead: overhead * k, dominance: dominance * k };
}
