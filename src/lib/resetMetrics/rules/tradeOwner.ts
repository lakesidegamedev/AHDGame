/** Annualized cleared-commodity net exports use anchor-valued flows and annual GDP. */
export function commodityTradeBalance(input: {
  exports: number;
  imports: number;
  annualGdpAnchor: number;
  turnsPerYear: number;
}): number | null {
  if (
    !Object.values(input).every(Number.isFinite) ||
    input.exports < 0 ||
    input.imports < 0 ||
    input.annualGdpAnchor <= 0 ||
    input.turnsPerYear <= 0
  )
    return null;
  return (((input.exports - input.imports) * input.turnsPerYear) / input.annualGdpAnchor) * 100;
}
