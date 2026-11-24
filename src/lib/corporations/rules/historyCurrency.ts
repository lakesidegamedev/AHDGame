/** Restate a recorded financial result only when its currency basis is known. */
export function restateHistoryFinancials<
  T extends { currencyCode?: string; fxRateAtWrite?: number },
>(
  row: T,
  targetCurrency: string | undefined,
  targetRate: number,
  fields: readonly (keyof T)[]
): T | null {
  if (row.currencyCode === targetCurrency) return { ...row };
  const sourceRate = row.currencyCode ? row.fxRateAtWrite : 1;
  const destinationRate = targetCurrency ? targetRate : 1;
  if (!(
    typeof sourceRate === "number" &&
    Number.isFinite(sourceRate) &&
    sourceRate > 0 &&
    Number.isFinite(destinationRate) &&
    destinationRate > 0
  ))
    return null;
  const result = { ...row };
  for (const key of fields) {
    const value = row[key];
    if (typeof value === "number")
      result[key] = ((value / sourceRate) * destinationRate) as T[keyof T];
  }
  return { ...result, currencyCode: targetCurrency, fxRateAtWrite: destinationRate };
}
