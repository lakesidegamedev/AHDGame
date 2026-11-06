import type { CorporationHistory } from "@/lib/db/types/corporationHistory";

/** History stores operating costs separately from gross bond interest. */
export function totalCostsPerTurnFromParts(parts: {
  totalCosts: number;
  perTurnBondInterestExpense?: number;
  perTurnBondDragOnNetIncome?: number;
}): number {
  const bondInterest = parts.perTurnBondInterestExpense ?? parts.perTurnBondDragOnNetIncome ?? 0;
  return parts.totalCosts + bondInterest;
}

export function historyTotalCostsPerTurn(history: CorporationHistory): number {
  return totalCostsPerTurnFromParts(history);
}

/** Retained earnings: operating result after distributions, plus investment income and net bond drag. */
export function realizedNetIncomePerTurn(
  history: Pick<
    CorporationHistory,
    "income" | "perTurnBondCouponIncome" | "perTurnBondDragOnNetIncome" | "dividendIncomeReceived"
  >
): number {
  return (
    history.income +
    (history.perTurnBondCouponIncome ?? 0) -
    (history.perTurnBondDragOnNetIncome ?? 0) +
    (history.dividendIncomeReceived ?? 0)
  );
}

/** Financials headlines show net income before the dividend distribution. */
export function historyNetIncomeBeforeDividends(history: CorporationHistory): number {
  return realizedNetIncomePerTurn(history) + Math.max(0, history.dividendPaidPerTurn ?? 0);
}
