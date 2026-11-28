/**
 * Cross-fund rebalancing market.
 *
 * After public-float absorption, funds that are overweight a constituent can
 * sell shares directly to funds that are underweight the same constituent.
 * Cash moves between funds; no issuer treasury or public float is touched.
 */

import type { Db, ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { Corporation, IndexFund, IndexFundHolding } from "@/lib/db/types";
import { creditSharesToFund, debitSharesFromFund } from "@/lib/corporations/shareholderOps";
import { resolveShareExecutionPrice } from "@/lib/corporations/marketExecution";
import { convertLocalPriceToAnchor } from "@/lib/indexFunds/fundHoldingsValuation";
import { computeHoldingsValueAnchor } from "@/lib/indexFunds/fundAllocation";
import { INDEX_FUND_MAX_EQUITY_ALLOCATION } from "@/lib/indexFunds/unitAccounting";
import {
  getFundById,
  insertFundTransaction,
  updateFundHoldings,
} from "@/lib/indexFunds/fundQueries";
import { recordShareTrade } from "@/lib/corporations/shareTradeHistory";
import {
  loadFxRatesByCurrency,
  requireCurrencyRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { emitTx } from "@/lib/financialTxLog/emit";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";

// ── Types ─────────────────────────────────────────────────────────────────

export type CrossRebalanceCorp = Pick<
  Corporation,
  | "_id"
  | "sharePrice"
  | "fundamentalSharePrice"
  | "totalShares"
  | "publicFloat"
  | "liquidCurrencyCode"
>;

export type CrossRebalanceFund = Pick<
  IndexFund,
  | "_id"
  | "name"
  | "anchorCurrencyCode"
  | "status"
  | "cashAnchor"
  | "holdings"
  | "targetConstituents"
  | "bondAllocations"
  | "mandate"
>;

export type PlannedCrossTransfer = {
  corporationId: ObjectId;
  sellerFundId: ObjectId;
  buyerFundId: ObjectId;
  shares: number;
  pricePerShareAnchor: number;
  valueAnchor: number;
};

export type CrossRebalanceResult = {
  transfers: number;
  sharesTransferred: number;
  valueTransferred: number;
  errors: string[];
};

type RebalanceParticipant = {
  fundId: ObjectId;
  fundName: string;
  anchorCurrencyCode: CurrencyCode;
  shares: number;
  priceAnchor: number;
  targetWeight: number;
  totalBackingAnchor: number;
  holdingsValueAnchor: number;
  cashAnchor: number;
  maxEquityValueAnchor: number;
  driftShares: number;
};

// ── Planning ──────────────────────────────────────────────────────────────

export function planFundCrossRebalancing(input: {
  funds: CrossRebalanceFund[];
  corps: CrossRebalanceCorp[];
  exchangeRates: Partial<Record<CurrencyCode, number>>;
  bondPrincipalByFundId?: Map<string, number>;
  minTransferShares?: number;
}): PlannedCrossTransfer[] {
  const plans: PlannedCrossTransfer[] = [];
  const bondPrincipalByFundId = input.bondPrincipalByFundId ?? new Map<string, number>();

  // Fund-level resources are shared across every corp in this pass: a buyer
  // fund's cash and its equity-allocation headroom (cap on TOTAL equity) are
  // consumed cumulatively as it buys different corps' shares. Track them per
  // fund - in anchor VALUE so they're comparable across corps priced
  // differently - so the plan can't over-commit cash or breach
  // INDEX_FUND_MAX_EQUITY_ALLOCATION across the whole pass. (Sells are not
  // credited back within a pass - that only keeps us more conservative.)
  const fundCashRemaining = new Map<string, number>();
  const fundEquityRemaining = new Map<string, number>();

  for (const corp of input.corps) {
    const executionPrice = resolveShareExecutionPrice(corp);
    if (!Number.isFinite(executionPrice) || executionPrice <= 0) continue;

    const participants = buildCorpParticipants({
      corp,
      funds: input.funds,
      exchangeRates: input.exchangeRates,
      bondPrincipalByFundId,
    });
    if (participants.length === 0) continue;

    // Seed the fund-level resource trackers the first time we see each fund
    // (its cash and equity headroom are the same fund total regardless of corp).
    for (const p of participants) {
      const key = p.fundId.toString();
      if (!fundCashRemaining.has(key)) fundCashRemaining.set(key, p.cashAnchor);
      if (!fundEquityRemaining.has(key)) {
        fundEquityRemaining.set(key, Math.max(0, p.maxEquityValueAnchor - p.holdingsValueAnchor));
      }
    }

    // Only match funds denominated in the same anchor currency so cash and
    // share value move 1:1 without introducing FX accounting in this pass.
    const byAnchor = groupByAnchor(participants);

    for (const group of byAnchor.values()) {
      const sellers = group
        .filter((p) => p.driftShares > 0)
        .sort((a, b) => b.driftShares - a.driftShares);
      const buyers = group
        .filter((p) => p.driftShares < 0)
        .sort((a, b) => a.driftShares - b.driftShares);
      if (sellers.length === 0 || buyers.length === 0) continue;

      // Deficit is corp-specific drift, so it resets per corp/group.
      const buyerDeficitShares = new Map<string, number>();
      for (const buyer of buyers) {
        buyerDeficitShares.set(buyer.fundId.toString(), -buyer.driftShares);
      }

      for (const seller of sellers) {
        let sellerRemaining = seller.driftShares;

        for (const buyer of buyers) {
          if (sellerRemaining <= 0) break;

          const key = buyer.fundId.toString();
          const deficitShares = buyerDeficitShares.get(key) ?? 0;
          if (deficitShares <= 0) continue;

          const cashRemainingShares = (fundCashRemaining.get(key) ?? 0) / buyer.priceAnchor;
          const equityRemainingShares = (fundEquityRemaining.get(key) ?? 0) / buyer.priceAnchor;

          const transferable = Math.min(
            sellerRemaining,
            deficitShares,
            cashRemainingShares,
            equityRemainingShares
          );
          const shares = Math.max(0, Math.floor(transferable));
          if (shares < (input.minTransferShares ?? 1)) continue;

          const valueAnchor = shares * buyer.priceAnchor;
          plans.push({
            corporationId: corp._id,
            sellerFundId: seller.fundId,
            buyerFundId: buyer.fundId,
            shares,
            pricePerShareAnchor: buyer.priceAnchor,
            valueAnchor,
          });

          sellerRemaining -= shares;
          buyerDeficitShares.set(key, deficitShares - shares);
          fundCashRemaining.set(key, (fundCashRemaining.get(key) ?? 0) - valueAnchor);
          fundEquityRemaining.set(key, (fundEquityRemaining.get(key) ?? 0) - valueAnchor);
        }
      }
    }
  }

  return plans;
}

function buildCorpParticipants(input: {
  corp: CrossRebalanceCorp;
  funds: CrossRebalanceFund[];
  exchangeRates: Partial<Record<CurrencyCode, number>>;
  bondPrincipalByFundId: Map<string, number>;
}): RebalanceParticipant[] {
  const { corp, funds, exchangeRates, bondPrincipalByFundId } = input;
  const executionPrice = resolveShareExecutionPrice(corp);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) return [];

  const participants: RebalanceParticipant[] = [];

  for (const fund of funds) {
    if (fund.status !== "active" || fund.mandate?.mode === "picked_stocks") continue;

    const priceAnchor = convertLocalPriceToAnchor(
      executionPrice,
      corp.liquidCurrencyCode,
      exchangeRates
    );
    if (priceAnchor === null || priceAnchor <= 0) continue;

    const holding = fund.holdings.find((h) => h.corporationId.toString() === corp._id.toString());
    const target = fund.targetConstituents.find(
      (t) => t.corporationId.toString() === corp._id.toString()
    );

    const shares = holding?.shares ?? 0;
    const targetWeight = target?.targetWeight ?? 0;
    const holdingsValueAnchor = computeHoldingsValueAnchor(fund);
    const bondPrincipalAnchor = bondPrincipalByFundId.get(fund._id.toString()) ?? 0;
    const totalBackingAnchor = fund.cashAnchor + holdingsValueAnchor + bondPrincipalAnchor;

    if (totalBackingAnchor <= 0) continue;

    const maxEquityValueAnchor = totalBackingAnchor * INDEX_FUND_MAX_EQUITY_ALLOCATION;
    const targetShares = (maxEquityValueAnchor * targetWeight) / priceAnchor;
    const driftShares = shares - targetShares;

    // Skip funds that are effectively at target (tiny drift from rounding).
    if (Math.abs(driftShares) < 1e-9) continue;

    participants.push({
      fundId: fund._id,
      fundName: fund.name,
      anchorCurrencyCode: fund.anchorCurrencyCode,
      shares,
      priceAnchor,
      targetWeight,
      totalBackingAnchor,
      holdingsValueAnchor,
      cashAnchor: fund.cashAnchor,
      maxEquityValueAnchor,
      driftShares,
    });
  }

  return participants;
}

function groupByAnchor(
  participants: RebalanceParticipant[]
): Map<CurrencyCode, RebalanceParticipant[]> {
  const map = new Map<CurrencyCode, RebalanceParticipant[]>();
  for (const p of participants) {
    const list = map.get(p.anchorCurrencyCode) ?? [];
    list.push(p);
    map.set(p.anchorCurrencyCode, list);
  }
  return map;
}

// ── Execution ─────────────────────────────────────────────────────────────

export async function executeFundCrossRebalancing(
  db: Db,
  plans: PlannedCrossTransfer[],
  currentTurn: number
): Promise<CrossRebalanceResult> {
  const result: CrossRebalanceResult = {
    transfers: 0,
    sharesTransferred: 0,
    valueTransferred: 0,
    errors: [],
  };

  if (plans.length === 0) return result;

  for (const plan of plans) {
    try {
      const executed = await executeSingleTransfer(db, plan, currentTurn);
      if (executed) {
        result.transfers++;
        result.sharesTransferred += executed.shares;
        result.valueTransferred += executed.valueAnchor;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(
        `Cross-rebalance ${plan.corporationId} ${plan.sellerFundId}→${plan.buyerFundId}: ${message}`
      );
    }
  }

  return result;
}

async function executeSingleTransfer(
  db: Db,
  plan: PlannedCrossTransfer,
  currentTurn: number
): Promise<{ shares: number; valueAnchor: number } | null> {
  const outcome = await withAtomicResult(db, (db) =>
    withTurnValueSettlement(
      db,
      "fund-cross-rebalance",
      currentTurn,
      async (db) => {
        const refused = { ok: false as const };
        if (
          plan.sellerFundId.equals(plan.buyerFundId) ||
          !Number.isSafeInteger(plan.shares) ||
          plan.shares <= 0 ||
          !Number.isFinite(plan.pricePerShareAnchor) ||
          plan.pricePerShareAnchor <= 0 ||
          !Number.isFinite(plan.valueAnchor) ||
          plan.valueAnchor <= 0 ||
          Math.abs(plan.shares * plan.pricePerShareAnchor - plan.valueAnchor) > 0.000001
        )
          return refused;
        const [seller, buyer, corp] = await Promise.all([
          getFundById(db, plan.sellerFundId),
          getFundById(db, plan.buyerFundId),
          corporationsCollection(db).findOne({ _id: plan.corporationId }),
        ]);
        if (
          !seller ||
          !buyer ||
          !corp ||
          seller.status !== "active" ||
          buyer.status !== "active" ||
          seller.anchorCurrencyCode !== buyer.anchorCurrencyCode ||
          seller.mandate?.mode === "picked_stocks" ||
          buyer.mandate?.mode === "picked_stocks" ||
          !seller.holdings.some(
            (holding) =>
              holding.corporationId.equals(plan.corporationId) && holding.shares >= plan.shares
          ) ||
          buyer.cashAnchor < plan.valueAnchor
        )
          return refused;
        const currency = resolveCorpLiquidCurrencyCode(corp);
        if (!currency) return refused;
        const rate = requireCurrencyRate(currency, (await loadFxRatesByCurrency(db)).get(currency));
        const executionPrice = plan.pricePerShareAnchor * rate;
        if (!Number.isFinite(executionPrice) || executionPrice <= 0) return refused;
        const now = new Date();
        const remaining = await debitSharesFromFund(
          db,
          plan.corporationId,
          plan.sellerFundId,
          plan.shares,
          { $set: { updatedAt: now } },
          { requireSufficient: true }
        );
        if (remaining < 0) return refused;
        if (
          !(await creditSharesToFund(
            db,
            plan.corporationId,
            plan.buyerFundId,
            plan.shares,
            executionPrice,
            { $set: { updatedAt: now } }
          ))
        )
          return refused;
        const debit = await indexFundsCollection(db).updateOne(
          { _id: buyer._id, cashAnchor: { $gte: plan.valueAnchor } },
          { $inc: { cashAnchor: -plan.valueAnchor }, $set: { updatedAt: now } }
        );
        if (debit.matchedCount !== 1) return refused;
        const credit = await indexFundsCollection(db).updateOne(
          { _id: seller._id },
          { $inc: { cashAnchor: plan.valueAnchor }, $set: { updatedAt: now } }
        );
        if (credit.matchedCount !== 1) throw new Error("Cross-fund recipient disappeared");
        await updateFundHoldings(
          db,
          seller._id,
          updateHoldingAfterSale(
            seller.holdings,
            plan.corporationId,
            plan.shares,
            plan.pricePerShareAnchor
          )
        );
        await updateFundHoldings(
          db,
          buyer._id,
          updateHoldingAfterPurchase(
            buyer.holdings,
            plan.corporationId,
            plan.shares,
            plan.pricePerShareAnchor
          )
        );
        for (const [fund, kind, note] of [
          [seller, "cross_fund_sell", `Sold ${plan.shares} shares to ${buyer.name}`],
          [buyer, "cross_fund_buy", `Bought ${plan.shares} shares from ${seller.name}`],
        ] as const) {
          await insertFundTransaction(db, {
            fundId: fund._id,
            kind,
            corporationId: plan.corporationId,
            shares: plan.shares,
            navAnchor: plan.pricePerShareAnchor,
            amountAnchor: plan.valueAnchor,
            note,
            createdAt: now,
          });
        }
        await emitTx(db, {
          type: "fund_transfer",
          turn: currentTurn,
          createdAt: now,
          subjectType: "fund",
          subjectId: buyer._id,
          subjectName: buyer.name,
          amount: -plan.valueAnchor,
          anchorAmount: -plan.valueAnchor,
          currencyCode: buyer.anchorCurrencyCode,
          counterpartyType: "fund",
          counterpartyId: seller._id,
          counterpartyName: seller.name,
          meta: {
            fundId: seller._id.toString(),
            fundCurrency: buyer.anchorCurrencyCode,
            corporationId: plan.corporationId.toString(),
            shares: plan.shares,
            pricePerShareAnchor: plan.pricePerShareAnchor,
            source: "cross-fund-rebalancing",
          },
        });
        await recordShareTrade(db, {
          corporationId: plan.corporationId,
          kind: "market_buy",
          turn: currentTurn,
          shares: plan.shares,
          pricePerShareAnchor: plan.pricePerShareAnchor,
          from: { name: `${seller.name} (index fund)` },
          to: { name: `${buyer.name} (index fund)` },
          corpCurrencyCode: resolveCorpLiquidCurrencyCode(corp) ?? undefined,
          note: "Cross-fund rebalancing transfer",
        });
        return { ok: true as const, shares: plan.shares, valueAnchor: plan.valueAnchor };
      },
      { sourceKey: `${currentTurn}:${plan.corporationId}:${plan.sellerFundId}:${plan.buyerFundId}` }
    )
  );
  return outcome.ok ? outcome : null;
}

// ── Holding updates ───────────────────────────────────────────────────────

export function updateHoldingAfterPurchase(
  holdings: IndexFundHolding[],
  corporationId: ObjectId,
  additionalShares: number,
  sharePriceAnchor: number
): IndexFundHolding[] {
  const existing = holdings.find((h) => h.corporationId.toString() === corporationId.toString());
  if (existing) {
    return holdings.map((h) => {
      if (h.corporationId.toString() !== corporationId.toString()) return h;
      const newShares = h.shares + additionalShares;
      const newAvg =
        h.avgCostPerShareAnchor !== undefined
          ? (h.shares * h.avgCostPerShareAnchor + additionalShares * sharePriceAnchor) / newShares
          : sharePriceAnchor;
      return {
        ...h,
        shares: newShares,
        avgCostPerShareAnchor: newAvg,
        lastValueAnchor: newShares * sharePriceAnchor,
      };
    });
  }
  return [
    ...holdings,
    {
      corporationId,
      shares: additionalShares,
      avgCostPerShareAnchor: sharePriceAnchor,
      lastValueAnchor: additionalShares * sharePriceAnchor,
    },
  ];
}

export function updateHoldingAfterSale(
  holdings: IndexFundHolding[],
  corporationId: ObjectId,
  sharesSold: number,
  sharePriceAnchor: number
): IndexFundHolding[] {
  return holdings
    .map((h) => {
      if (h.corporationId.toString() !== corporationId.toString()) return h;
      const newShares = h.shares - sharesSold;
      if (newShares <= 0) return null;
      return {
        ...h,
        shares: newShares,
        lastValueAnchor: newShares * sharePriceAnchor,
      };
    })
    .filter((h): h is IndexFundHolding => h !== null);
}
