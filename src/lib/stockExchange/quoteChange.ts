/**
 * Percent change of the live share price against the close one turn back. The
 * corporation page and the status bar both read this, so the price and its
 * change always describe the same move. The settled history can end on the
 * live price, so the comparison point is the second newest entry.
 */
export function liveChangeVsPreviousClose(
  livePrice: number,
  history: ReadonlyArray<{ sharePrice: number }>
): number {
  if (history.length < 2 || !Number.isFinite(livePrice)) return 0;
  const prevClose = history[history.length - 2].sharePrice;
  if (!Number.isFinite(prevClose) || prevClose <= 0) return 0;
  return ((livePrice - prevClose) / prevClose) * 100;
}
