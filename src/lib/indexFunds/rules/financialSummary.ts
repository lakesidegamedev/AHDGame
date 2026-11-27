/** Capital transactions do not establish earned profit or operating expense. */
export function recordedDividendSummary(
  transactions: readonly { kind: string; amountAnchor: number }[]
) {
  let grossIncome = 0,
    grossExpense = 0;
  const byKind = new Map<string, { income: number; expense: number; count: number }>();
  for (const tx of transactions) {
    if (tx.kind !== "dividend_pass_through" && tx.kind !== "dividend_reinvest") continue;
    if (!Number.isFinite(tx.amountAnchor) || tx.amountAnchor < 0) continue;
    const amount = tx.amountAnchor;
    const line = byKind.get(tx.kind) ?? { income: 0, expense: 0, count: 0 };
    grossIncome += amount;
    line.income += amount;
    if (tx.kind === "dividend_pass_through") {
      grossExpense += amount;
      line.expense += amount;
    }
    line.count++;
    byKind.set(tx.kind, line);
  }
  return { grossIncome, grossExpense, netIncome: grossIncome - grossExpense, byKind };
}
