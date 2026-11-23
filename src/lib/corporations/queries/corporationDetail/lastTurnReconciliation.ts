import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import type { CostBreakdown } from "@/lib/corporations/rules/costBreakdown";
import {
  reconcileLastTurn,
  type CashFlowInput,
  type LastTurnReconciliation,
} from "@/lib/corporations/rules/lastTurnReconciliation";

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
  perTurnBondCouponIncome?: number;
  perTurnBondDragOnNetIncome?: number;
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
  perTurnBondCouponIncome: 1,
  perTurnBondDragOnNetIncome: 1,
} as const;

/**
 * Cash is snapshotted mid-turn and re-written a moment later once bond flows
 * settle, so a row created within this grace of a snapshot belongs to it.
 */
export const SNAPSHOT_GRACE_MS = 2 * 60 * 1000;

/**
 * The ledger filter for one walk. Player actions are stamped with the last
 * completed turn, so a turn stamp cannot say which snapshot interval an action
 * fell in; the creation time can. Falls back to the turn stamp when either
 * snapshot has no creation time.
 */
export function cashWalkWindow(
  latest: { turn: number; createdAt?: Date },
  previous: { createdAt?: Date } | null
): { turn: number } | { createdAt: { $gt: Date; $lte: Date } } {
  if (!(latest.createdAt instanceof Date) || !(previous?.createdAt instanceof Date)) {
    return { turn: latest.turn };
  }
  return {
    createdAt: {
      $gt: new Date(previous.createdAt.getTime() + SNAPSHOT_GRACE_MS),
      $lte: new Date(latest.createdAt.getTime() + SNAPSHOT_GRACE_MS),
    },
  };
}

/** A logged movement in the company's reporting currency; null when it cannot be converted. */
function toReportingAmount(
  tx: TxProjection,
  reportingCurrency: string | undefined,
  fxRateAtWrite: number | undefined
): number | null {
  if (!reportingCurrency || tx.currencyCode === reportingCurrency) return tx.amount;
  if (typeof tx.anchorAmount === "number" && typeof fxRateAtWrite === "number") {
    return tx.anchorAmount * fxRateAtWrite;
  }
  return null;
}

/** Bond figures are stored in anchor money; the row's own rate converts them. */
function anchorToLocal(anchor: number | undefined, rate: number | undefined): number | null {
  if (typeof anchor !== "number") return null;
  return typeof rate === "number" && rate > 0 ? anchor * rate : anchor;
}

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
      },
    }
  );
  const txRows = await financialTxLogCollection<TxProjection>(db)
    .find(
      {
        subjectId: corporation._id,
        subjectType: "corporation",
        ...cashWalkWindow(latest, previous),
      },
      { projection: { type: 1, amount: 1, currencyCode: 1, anchorAmount: 1 }, limit: 500 }
    )
    .toArray();

  const sameCurrency = !previous || previous.currencyCode === latest.currencyCode;
  const cashBefore =
    previous && sameCurrency && typeof previous.liquidCapital === "number"
      ? previous.liquidCapital
      : null;

  const sameLiveCurrency =
    !corporation.liquidCurrencyCode ||
    !latest.currencyCode ||
    corporation.liquidCurrencyCode === latest.currencyCode;

  const flows: CashFlowInput[] = [];
  for (const tx of txRows) {
    const amount = toReportingAmount(tx, latest.currencyCode, latest.fxRateAtWrite);
    if (amount != null) flows.push({ type: tx.type, amount });
  }

  return reconcileLastTurn(
    {
      turn: latest.turn,
      revenue: latest.revenue,
      totalCosts: latest.totalCosts,
      retained: latest.income,
      dividendPaid: Math.max(0, latest.dividendPaidPerTurn ?? 0),
      tax: Math.max(0, latest.corporateTaxPaid ?? 0),
      bondCouponIncome: anchorToLocal(latest.perTurnBondCouponIncome, latest.fxRateAtWrite),
      bondInterestPaid: anchorToLocal(latest.perTurnBondDragOnNetIncome, latest.fxRateAtWrite),
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
    flows
  );
}
