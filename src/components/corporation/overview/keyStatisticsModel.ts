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
  // Costs are what sits between revenue and operating income, so interest is
  // counted once, under "Interest and tax". When net income is above operating
  // income (investment income), that surplus lowers costs rather than being
  // dropped, which keeps the four parts adding up to revenue.
  const operatingCosts = revenue - financials.operatingIncome;
  const gap = financials.operatingIncome - basis.netIncome;
  return {
    costs: Math.max(0, gap < 0 ? operatingCosts + gap : operatingCosts),
    interestAndTax: Math.max(0, gap),
    dividends: Math.max(0, basis.dividendPaid),
    retained: Math.max(0, basis.retained),
  };
}

/**
 * The same split drawn from one recorded turn, so every part comes from the
 * same books. Mixing a forecast operating income with a recorded net income
 * attributed the whole forecast error to "interest and tax".
 */
export function recordedRevenueSplit(statement: {
  revenue: number;
  costs: number;
  tax: number;
  otherNet: number;
  dividendPaid: number;
  retained: number;
}): { costs: number; interestAndTax: number; dividends: number; retained: number } | null {
  if (!(Number.isFinite(statement.revenue) && statement.revenue > 0)) return null;
  if (!(statement.retained >= 0)) return null;
  const interestAndTax = statement.tax - statement.otherNet;
  if (interestAndTax < 0) return null;
  return {
    costs: Math.max(0, statement.costs),
    interestAndTax,
    dividends: Math.max(0, statement.dividendPaid),
    retained: statement.retained,
  };
}

export interface PerShareFigure {
  label: string;
  /** Per-share amount in the corporation's currency; null when it cannot be stated. */
  amount: number | null;
  title?: string;
}

/**
 * The per-share figure an Overview shows. A private corporation has no market
 * price, so it states its book value per share and says so; a listed one
 * states its quote.
 */
export function perShareFigure(input: {
  isPrivate: boolean;
  sharePrice: number;
  bookValue: number | null;
  totalShares: number;
}): PerShareFigure {
  if (!input.isPrivate) return { label: "Share price", amount: input.sharePrice };
  const amount =
    input.bookValue != null && Number.isFinite(input.bookValue) && input.totalShares > 0
      ? input.bookValue / input.totalShares
      : null;
  return {
    label: "Book value / share",
    amount,
    title: "Assets minus debt, per share. Private shares have no market price.",
  };
}
