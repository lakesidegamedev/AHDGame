/**
 * Pool depth is cash divided by the bid, so a cash-rich pool can "afford" more
 * units than exist. A seller can never sell more than exists, so the depth
 * shown to players stops at the amount in existence.
 */
export function displayedMarketDepth(depthUnits: number, unitsInExistence: number): number {
  const depth = Number.isFinite(depthUnits) ? Math.max(0, Math.floor(depthUnits)) : 0;
  const existing = Number.isFinite(unitsInExistence)
    ? Math.max(0, Math.floor(unitsInExistence))
    : 0;
  return Math.min(depth, existing);
}
