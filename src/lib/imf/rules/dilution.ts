/** Newly issued shares needed for the requested fully diluted ownership. */
export function dilutionSharesForImf(
  totalShares: number,
  currentImfShares: number,
  targetPercent: number
): number {
  const p = targetPercent / 100;
  if (
    !Number.isSafeInteger(totalShares) ||
    totalShares <= 0 ||
    !Number.isSafeInteger(currentImfShares) ||
    currentImfShares < 0 ||
    currentImfShares > totalShares ||
    !Number.isFinite(p) ||
    p <= 0 ||
    p >= 1
  )
    return 0;
  return Math.max(0, Math.floor((p * totalShares - currentImfShares) / (1 - p)));
}
