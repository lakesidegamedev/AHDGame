/**
 * Net margin for a plants sector: realized profit over realized revenue, in
 * percent.
 *
 * Profit already nets the whole bill, unsold output included, so this is an
 * ordinary net margin, unlike the stored `effectiveProfitMargin` which divides
 * by sold revenue and inflates when little output sells. At most 100 percent,
 * negative when losing money.
 *
 * Presentation only. Nothing in the turn reads it back.
 */

/**
 * The figure a sector that sold nothing while still paying its bill reads as.
 * Its true ratio has no finite value; returning null instead would send the
 * callers back to the sold-units margin, which says nothing about a sector
 * that sold nothing.
 */
export const NET_MARGIN_FLOOR_PCT = -999.9;

export function plantsNetMarginPct(args: {
  profit: number;
  revenue: number;
  /** Everything the sector paid this period, unsold output included. */
  totalCost: number;
}): number | null {
  const { profit, revenue, totalCost } = args;
  if (!Number.isFinite(profit) || !Number.isFinite(revenue)) return null;
  if (revenue > 0) return Math.max(NET_MARGIN_FLOOR_PCT, (profit / revenue) * 100);
  return Number.isFinite(totalCost) && totalCost > 0 ? NET_MARGIN_FLOOR_PCT : null;
}
