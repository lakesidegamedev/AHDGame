/** Read settled retained income and its payout together, or label the projected basis. */
export function corpIncomeBasis(f: {
  income: number;
  realizedIncome?: number;
  realizedDividendPaid?: number;
  dividendDistribution: number;
}): { netIncome: number; retained: number; dividendPaid: number; isRealized: boolean } {
  if (typeof f.realizedIncome === "number") {
    const dividendPaid = Math.max(0, f.realizedDividendPaid ?? 0);
    return {
      netIncome: f.realizedIncome + dividendPaid,
      retained: f.realizedIncome,
      dividendPaid,
      isRealized: true,
    };
  }
  const dividendPaid = Math.max(0, f.dividendDistribution);
  return {
    netIncome: f.income,
    retained: f.income - dividendPaid,
    dividendPaid,
    isRealized: false,
  };
}
