/** Anchor-denominated funds cost of one canvass, before the campaign price level. */
export const CANVASS_COST_FUNDS_ANCHOR = 100;

/**
 * Funds cost of one canvass at a world's campaign price level. At the modern
 * level (1) this is exactly the anchor cost; at an earlier era it deflates with
 * income and every other campaign cost, rounded to a whole unit and never free.
 */
export function canvassUnitFundsCost(priceLevel: number): number {
  if (!Number.isFinite(priceLevel) || priceLevel === 1) return CANVASS_COST_FUNDS_ANCHOR;
  return Math.max(1, Math.round(CANVASS_COST_FUNDS_ANCHOR * priceLevel));
}
