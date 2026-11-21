/** Historical earnings retain their witnessed anchor value after a currency retires. */
export function taxableEarningsAnchor(
  amount: number,
  taxableIncome: number,
  recordedAnchor: number | null | undefined,
  observedRate: number | undefined
): number {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(taxableIncome) ||
    taxableIncome < 0
  )
    throw new Error("Invalid historical earnings");
  if (recordedAnchor != null) {
    if (!Number.isFinite(recordedAnchor) || recordedAnchor < 0)
      throw new Error("Invalid recorded earnings anchor");
    return (recordedAnchor * taxableIncome) / amount;
  }
  if (!observedRate || !Number.isFinite(observedRate) || observedRate <= 0)
    throw new Error("Earnings exchange rate unavailable");
  return taxableIncome / observedRate;
}
