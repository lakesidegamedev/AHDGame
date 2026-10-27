/**
 * Convert a budget amount in the country's seed unit to era dollars using the
 * rate the server resolved for the world's active preset.
 *
 * Split from `budgetUsdEquivalent.ts`, which reads the full country client
 * config (and the preset override table) to find that rate. The budget page
 * receives the rate with its budget payload instead.
 */
export function budgetUsdEquivalentFromRate(
  localAmount: number,
  usdExchangeRate: number | null | undefined
): number | null {
  if (!Number.isFinite(localAmount)) return null;
  if (
    typeof usdExchangeRate !== "number" ||
    !Number.isFinite(usdExchangeRate) ||
    usdExchangeRate <= 0
  ) {
    return null;
  }
  if (Math.abs(usdExchangeRate - 1) < 1e-9) return null;
  const usd = localAmount * usdExchangeRate;
  return Number.isFinite(usd) ? usd : null;
}
