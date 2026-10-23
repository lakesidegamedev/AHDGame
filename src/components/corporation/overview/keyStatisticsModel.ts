/**
 * Where a period's revenue went: costs, then interest and tax (operating
 * income less net income), then dividends, then what was kept. Only defined
 * for a profitable period with revenue, because a loss leaves costs larger
 * than revenue and the parts would no longer add up to it.
 */
export function revenueSplit(
  financials: { totalRevenue: number; totalCosts: number; operatingIncome: number },
  basis: { netIncome: number; dividendPaid: number; retained: number }
): { costs: number; interestAndTax: number; dividends: number; retained: number } | null {
  const revenue = financials.totalRevenue;
  if (!(Number.isFinite(revenue) && revenue > 0)) return null;
  if (!(Number.isFinite(basis.netIncome) && basis.netIncome >= 0)) return null;
  return {
    costs: Math.max(0, financials.totalCosts),
    interestAndTax: Math.max(0, financials.operatingIncome - basis.netIncome),
    dividends: Math.max(0, basis.dividendPaid),
    retained: Math.max(0, basis.retained),
  };
}
