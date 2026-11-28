import type { CorporationHistory } from "@/lib/db/types/corporationHistory";

/** History stores operating costs separately from gross bond interest. */
export function totalCostsPerTurnFromParts(parts: {
  totalCosts: number;
  settledBankLoanInterestPaid?: number;
  settledImfInterestPaid?: number;
  imfSettlementUnavailable?: boolean;
  settledBondInterestPaid?: number;
  perTurnBondInterestExpense?: number;
  perTurnBondDragOnNetIncome?: number;
}): number {
  const bondInterest =
    parts.settledBondInterestPaid ??
    parts.perTurnBondInterestExpense ??
    parts.perTurnBondDragOnNetIncome ??
    0;
  return (
    parts.totalCosts +
    bondInterest +
    (parts.settledBankLoanInterestPaid ?? 0) +
    (parts.settledImfInterestPaid ?? 0)
  );
}

export function historyTotalCostsPerTurn(history: CorporationHistory): number {
  return totalCostsPerTurnFromParts(history);
}

/** Retained earnings: operating result after distributions, plus investment income and net bond drag. */
export function realizedNetIncomePerTurn(
  history: Pick<
    CorporationHistory,
    | "income"
    | "perTurnBondCouponIncome"
    | "perTurnBondDragOnNetIncome"
    | "dividendIncomeReceived"
    | "bondCouponFxFees"
    | "settledBondCouponIncome"
    | "settledBankLoanInterestPaid"
    | "settledImfInterestPaid"
    | "settledImfInterestReceived"
    | "settledBondInterestPaid"
  >
): number {
  return (
    history.income -
    (history.settledBankLoanInterestPaid ?? 0) -
    (history.settledImfInterestPaid ?? 0) +
    (history.settledImfInterestReceived ?? 0) +
    (history.settledBondCouponIncome ??
      (history.perTurnBondCouponIncome ?? 0) - (history.bondCouponFxFees ?? 0)) -
    (history.settledBondInterestPaid ?? history.perTurnBondDragOnNetIncome ?? 0) +
    (history.dividendIncomeReceived ?? 0)
  );
}

/** Financials headlines show net income before the dividend distribution. */
export function historyNetIncomeBeforeDividends(history: CorporationHistory): number {
  return realizedNetIncomePerTurn(history) + Math.max(0, history.dividendPaidPerTurn ?? 0);
}

/** The income denominator belongs to the same snapshot as its retained result. */
export function historyIncomeBase(
  history: Pick<
    CorporationHistory,
    | "revenue"
    | "perTurnBondCouponIncome"
    | "bondCouponFxFees"
    | "settledBondCouponIncome"
    | "settledImfInterestReceived"
    | "dividendIncomeReceived"
  >
): number {
  return (
    history.revenue +
    Math.max(
      0,
      history.settledBondCouponIncome ??
        (history.perTurnBondCouponIncome ?? 0) - (history.bondCouponFxFees ?? 0)
    ) +
    Math.max(0, history.settledImfInterestReceived ?? 0) +
    Math.max(0, history.dividendIncomeReceived ?? 0)
  );
}

/** Old accrual fields cannot prove whether a bond cash leg completed. */
export function historyBondSettlementUnavailable(row: {
  perTurnBondCouponIncome?: number;
  perTurnBondInterestExpense?: number;
  perTurnBondDragOnNetIncome?: number;
  settledBondCouponIncome?: number;
  settledBondInterestPaid?: number;
}): boolean {
  return (
    ((row.perTurnBondCouponIncome ?? 0) !== 0 && row.settledBondCouponIncome == null) ||
    ((row.perTurnBondInterestExpense ?? row.perTurnBondDragOnNetIncome ?? 0) !== 0 &&
      row.settledBondInterestPaid == null)
  );
}

/** Missing settlement evidence must not be interpreted as a zero financing cost. */
export function historySettlementUnavailable(
  row: Parameters<typeof historyBondSettlementUnavailable>[0] & {
    settledBankLoanInterestPaid?: number;
    settledImfInterestPaid?: number;
    imfSettlementUnavailable?: boolean;
  }
): boolean {
  return (
    row.imfSettlementUnavailable === true ||
    historyBondSettlementUnavailable(row) ||
    typeof row.settledBankLoanInterestPaid !== "number" ||
    !Number.isFinite(row.settledBankLoanInterestPaid)
  );
}
