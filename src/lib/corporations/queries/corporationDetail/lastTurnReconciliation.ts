import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import type { CostBreakdown } from "@/lib/corporations/rules/costBreakdown";
import {
  reconcileLastTurn,
  type LastTurnReconciliation,
} from "@/lib/corporations/rules/lastTurnReconciliation";

import { realizedNetIncomePerTurn } from "@/lib/corporations/rules/historyFinancials";
import {
  cashWalkEvidence,
  reportingCashFlows,
  type CashMovementGroup,
} from "@/lib/corporations/rules/cashWalkEvidence";

interface HistoryProjection {
  turn: number;
  revenue?: number;
  totalCosts?: number;
  costBreakdown?: CostBreakdown;
  headcount?: number;
  income?: number;
  dividendPaidPerTurn?: number;
  corporateTaxPaid?: number;
  liquidCapital?: number;
  currencyCode?: string;
  fxRateAtWrite?: number;
  createdAt?: Date;
  cashSnapshotAt?: Date;
  dividendIncomeReceived?: number;
  bondCouponFxFees?: number;
  settledBondCouponIncome?: number;
  settledBondInterestPaid?: number;
  settledBankLoanInterestPaid?: number;
  perTurnBondCouponIncome?: number;
  perTurnBondDragOnNetIncome?: number;
  dividendReceivedTax?: number;
  sectorFxSpread?: number;
}

interface TxProjection {
  type: string;
  amount: number;
  currencyCode: string;
  anchorAmount?: number;
}

const HISTORY_PROJECTION = {
  turn: 1,
  revenue: 1,
  totalCosts: 1,
  costBreakdown: 1,
  headcount: 1,
  income: 1,
  dividendPaidPerTurn: 1,
  corporateTaxPaid: 1,
  liquidCapital: 1,
  currencyCode: 1,
  fxRateAtWrite: 1,
  createdAt: 1,
  cashSnapshotAt: 1,
  dividendIncomeReceived: 1,
  bondCouponFxFees: 1,
  settledBondCouponIncome: 1,
  settledBondInterestPaid: 1,
  settledBankLoanInterestPaid: 1,
  perTurnBondCouponIncome: 1,
  perTurnBondDragOnNetIncome: 1,
  dividendReceivedTax: 1,
  sectorFxSpread: 1,
} as const;

/**
 * The most recently recorded turn for a company, tied to the change in cash
 * since the turn before it. Null for a company with no recorded turn.
 */
export async function loadLastTurnReconciliation(
  db: Db,
  corporation: Pick<Corporation, "_id"> &
    Partial<Pick<Corporation, "liquidCapital" | "liquidCurrencyCode">>
): Promise<LastTurnReconciliation | null> {
  const history = corporationHistoryCollection<HistoryProjection>(db);
  const latest = await history.findOne(
    { corporationId: corporation._id },
    { sort: { turn: -1 }, projection: HISTORY_PROJECTION }
  );
  if (
    !latest ||
    typeof latest.revenue !== "number" ||
    typeof latest.totalCosts !== "number" ||
    typeof latest.income !== "number" ||
    typeof latest.liquidCapital !== "number"
  ) {
    return null;
  }

  const previous = await history.findOne(
    { corporationId: corporation._id, turn: latest.turn - 1 },
    {
      projection: {
        liquidCapital: 1,
        currencyCode: 1,
        totalCosts: 1,
        costBreakdown: 1,
        headcount: 1,
        createdAt: 1,
        cashSnapshotAt: 1,
      },
    }
  );
  const evidence = cashWalkEvidence(latest, previous);
  const groups = await financialTxLogCollection<TxProjection>(db)
    .aggregate<CashMovementGroup>(
      [
        { $match: { subjectId: corporation._id, subjectType: "corporation", ...evidence.filter } },
        ...(latest.settledBankLoanInterestPaid != null
          ? [
              {
                $set: {
                  amount: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$type", "bank_loan_repayment"] },
                          { $eq: ["$turn", latest.turn] },
                          { $isNumber: "$meta.interestPaid" },
                        ],
                      },
                      { $add: ["$amount", "$meta.interestPaid"] },
                      "$amount",
                    ],
                  },
                  anchorAmount: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$type", "bank_loan_repayment"] },
                          { $eq: ["$turn", latest.turn] },
                          { $isNumber: "$meta.interestPaid" },
                          { $isNumber: "$anchorAmount" },
                          { $ne: ["$amount", 0] },
                        ],
                      },
                      {
                        $multiply: [
                          "$anchorAmount",
                          { $divide: [{ $add: ["$amount", "$meta.interestPaid"] }, "$amount"] },
                        ],
                      },
                      "$anchorAmount",
                    ],
                  },
                },
              },
            ]
          : []),
        {
          $group: {
            _id: {
              type: "$type",
              currencyCode: "$currencyCode",
              hasAnchorAmount: { $isNumber: "$anchorAmount" },
            },
            amount: { $sum: "$amount" },
            anchorAmount: { $sum: "$anchorAmount" },
            count: { $sum: 1 },
            missingAnchor: { $sum: { $cond: [{ $isNumber: "$anchorAmount" }, 0, 1] } },
          },
        },
      ],
      { maxTimeMS: 6000 }
    )
    .toArray();

  const sameCurrency = !previous || previous.currencyCode === latest.currencyCode;
  const cashBefore =
    previous && sameCurrency && typeof previous.liquidCapital === "number"
      ? previous.liquidCapital
      : null;

  const sameLiveCurrency = corporation.liquidCurrencyCode === latest.currencyCode;

  const { flows, unconvertedMovements } = reportingCashFlows(
    groups,
    latest.currencyCode,
    latest.fxRateAtWrite
  );
  const result = reconcileLastTurn(
    {
      turn: latest.turn,
      revenue: latest.revenue,
      totalCosts: latest.totalCosts,
      retained: realizedNetIncomePerTurn({ ...latest, income: latest.income }),
      dividendPaid: Math.max(0, latest.dividendPaidPerTurn ?? 0),
      tax: Math.max(0, latest.corporateTaxPaid ?? 0),
      bondCouponIncome:
        latest.settledBondCouponIncome ??
        (latest.perTurnBondCouponIncome ?? 0) - (latest.bondCouponFxFees ?? 0),
      bondInterestPaid: latest.settledBondInterestPaid ?? latest.perTurnBondDragOnNetIncome,
      bankLoanInterestPaid: latest.settledBankLoanInterestPaid,
      dividendIncomeReceived: latest.dividendIncomeReceived,
      dividendReceivedTax: latest.dividendReceivedTax ?? null,
      sectorFxSpread: latest.sectorFxSpread ?? null,
      cashAfter: latest.liquidCapital,
      cashNow:
        typeof corporation.liquidCapital === "number" && sameLiveCurrency
          ? corporation.liquidCapital
          : null,
      cashBefore,
      previousCosts:
        previous && sameCurrency && typeof previous.totalCosts === "number"
          ? previous.totalCosts
          : null,
      costBreakdown: latest.costBreakdown ?? null,
      headcount: latest.headcount ?? null,
      previousCostBreakdown: previous && sameCurrency ? (previous.costBreakdown ?? null) : null,
      previousHeadcount: previous && sameCurrency ? (previous.headcount ?? null) : null,
    },
    flows,
    { unconverted: unconvertedMovements, truncated: false }
  );
  result.cash.evidence = { boundary: evidence.boundary, unconvertedMovements };
  result.reportingCurrency = latest.currencyCode ?? null;
  return result;
}
