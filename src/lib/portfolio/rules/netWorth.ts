/** Personal net worth subtracts loan and unpaid tax liabilities after valuing all assets. */
export function personalNetWorth(assets: number, loanDebt: number, incomeTaxDebt = 0): number {
  if (![assets, loanDebt, incomeTaxDebt].every(Number.isFinite))
    throw new Error("Invalid personal valuation");
  return Math.max(0, assets - loanDebt - incomeTaxDebt);
}

/** Portfolio pages retain negative net worth while rankings floor it at zero. */
export function personalPortfolioNetWorth(parts: {
  stockValue: number;
  bondValue: number;
  fundValue: number;
  cashValue: number;
  loanDebt: number;
  incomeTaxDebt: number;
}): number {
  if (!Object.values(parts).every(Number.isFinite))
    throw new Error("Invalid personal portfolio valuation");
  return (
    parts.stockValue +
    parts.bondValue +
    parts.fundValue +
    parts.cashValue -
    parts.loanDebt -
    parts.incomeTaxDebt
  );
}

/** Historical net worth never substitutes current liabilities or gross assets for missing evidence. */
export function recordedPersonalNetWorth(point: {
  totalValue: number;
  netValue?: number;
  locDebtValue?: number;
  incomeTaxDebtValue?: number;
}): number | null {
  if (
    [point.totalValue, point.locDebtValue, point.incomeTaxDebtValue].every(
      (n) => typeof n === "number" && Number.isFinite(n)
    )
  ) {
    return (
      Math.round((point.totalValue - point.locDebtValue! - point.incomeTaxDebtValue!) * 100) / 100
    );
  }
  return typeof point.netValue === "number" && Number.isFinite(point.netValue)
    ? point.netValue
    : null;
}
