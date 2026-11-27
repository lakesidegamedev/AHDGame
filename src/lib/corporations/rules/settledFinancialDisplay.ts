import type { CorporationHistory } from "@/lib/db/types/corporationHistory";
import { restateHistoryFinancials } from "./historyCurrency";
import { historySettlementUnavailable, realizedNetIncomePerTurn } from "./historyFinancials";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
export type SettledFinancialRow = Pick<
  CorporationHistory,
  | "income"
  | "revenue"
  | "currencyCode"
  | "fxRateAtWrite"
  | "settledBankLoanInterestPaid"
  | "settledImfInterestPaid"
  | "settledImfInterestReceived"
  | "settledImfPrincipalPaid"
  | "settledImfPrincipalReceived"
  | "imfSettlementUnavailable"
  | "settledBondCouponIncome"
  | "settledBondInterestPaid"
  | "perTurnBondCouponIncome"
  | "perTurnBondDragOnNetIncome"
  | "perTurnBondInterestExpense"
  | "bondCouponFxFees"
  | "dividendIncomeReceived"
>;
/** Settled operating revenue and retained income share the history row's denomination and turn. */
export function settledFinancialDisplay(
  row: SettledFinancialRow,
  targetCurrency: string | undefined,
  targetRate: number
): { revenue: number | null; income: number | null } {
  const converted = restateHistoryFinancials(row, targetCurrency, targetRate, [
    "income",
    "revenue",
    "settledBankLoanInterestPaid",
    "settledImfInterestPaid",
    "settledImfInterestReceived",
    "settledImfPrincipalPaid",
    "settledImfPrincipalReceived",

    "settledBondCouponIncome",
    "settledBondInterestPaid",
    "perTurnBondCouponIncome",
    "perTurnBondDragOnNetIncome",
    "perTurnBondInterestExpense",
    "bondCouponFxFees",
    "dividendIncomeReceived",
  ]);
  if (!converted) return { revenue: null, income: null };
  const revenue = Number.isFinite(converted.revenue) ? converted.revenue * TURNS_PER_DAY : null;
  const income =
    !Number.isFinite(converted.income) || historySettlementUnavailable(converted)
      ? null
      : realizedNetIncomePerTurn(converted) * TURNS_PER_DAY;
  return { revenue, income: Number.isFinite(income) ? income : null };
}
