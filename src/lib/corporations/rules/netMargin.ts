/**
 * Net margin for a plants sector: realized profit over realized revenue, in
 * percent.
 *
 * Profit already nets the whole bill, unsold output included, so this is an
 * ordinary net margin, unlike the stored `effectiveProfitMargin` which divides
 * by sold revenue and inflates when little output sells. Negative when losing money; no numeric clipping is applied.
 *
 * Presentation only. Nothing in the turn reads it back.
 */

export function plantsNetMarginPct(args: {
  profit: number;
  revenue: number;
  /** Everything the sector paid this period, unsold output included. */
  totalCost: number;
}): number | null {
  const { profit, revenue } = args;
  if (!Number.isFinite(profit) || !Number.isFinite(revenue)) return null;
  if (revenue > 0) return (profit / revenue) * 100;
  return null;
}
