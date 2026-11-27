/** A missing paid-interest value is zero only after every eligible loan was serviced. */
export function settledLoanInterestForHistory(input: {
  turn: number;
  historyCurrency?: string;
  paid?: number;
  paidCurrency?: string;
  loans: readonly { status: string; originatedTurn?: number; lastProcessedTurn?: number }[];
}): number | null {
  for (const loan of input.loans) {
    if (loan.originatedTurn !== undefined && loan.originatedTurn >= input.turn) continue;
    if (
      (loan.status === "current" || loan.status === "arrears") &&
      (loan.lastProcessedTurn ?? -1) < input.turn
    )
      return null;
  }
  const paid = input.paid ?? 0;
  if (!Number.isFinite(paid) || paid < 0) return null;
  if (paid > 0 && input.paidCurrency !== input.historyCurrency) return null;
  return paid;
}
