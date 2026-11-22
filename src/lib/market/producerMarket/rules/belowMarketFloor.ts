/**
 * Lowest ask a below-market posture may reach. The posture undercuts the
 * market price down to the seller's own unit cost and no further; when the
 * market is already under that cost the seller asks the market price. Without
 * this floor a seller big enough to set the clearing undercuts its own price
 * every turn and the market falls without limit. Zero means no floor: the
 * posture is not below market, or the seller has no unit cost to protect.
 */
export function belowMarketAskFloor(input: {
  markup: number;
  marketUnitPrice: number;
  unitCost: number | null;
}): number {
  if (!(input.markup < 0)) return 0;
  const cost = input.unitCost;
  if (cost == null || !Number.isFinite(cost) || !(cost > 0)) return 0;
  return Math.max(0, Math.min(input.marketUnitPrice, cost));
}
