/**
 * Producer-market shadow (market recovery Phase 2, staged with no economic
 * writes). Runs the unified producer economy for one turn in memory beside the
 * live engine and summarises how its outcome differs, per industry.
 *
 * Pure: plans, cash and demand in; a summary out. Nothing here moves money.
 */
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { producerTrades, type MarketAccount, type PurchaseOrder } from "./rules";
import type { HouseholdSpec } from "./householdDemandRules";
import type { PublicPurchaseLine } from "./publicBuyerRules";
import { nextReferencePrice } from "./referencePriceRules";
import type { ProducerPayable } from "./payablesRules";

/** Planning passes the shadow allows per turn (see the t300 replay note above). */
export const SHADOW_PLANNING_PASSES = 8;

export interface ShadowProducer {
  plan: ProductionPlan;
  sectorType: string;
  /** Legacy P&L for the same plant and turn, anchor units. */
  legacy: { revenue: number; profit: number } | null;
}

export interface ShadowIndustryRow {
  sectorType: string;
  plants: number;
  legacyRevenue: number;
  legacyProfit: number;
  legacyLosing: number;
  shadowRevenue: number;
  shadowProfit: number;
  shadowLosing: number;
}

export interface ShadowSummary {
  turn: number;
  plants: number;
  skipped: number;
  legacyLosingShare: number;
  shadowLosingShare: number;
  householdSpend: number;
  publicSpend: number;
  /** Corporate advertising bought from marketing budgets. */
  marketingSpend: number;
  /** Construction work on build orders bought from producers. */
  investmentSpend: number;
  industries: ShadowIndustryRow[];
  /** World-book traded volume and volume-weighted price per commodity (anchor units). */
  prices: { commodity: string; units: number; unitPrice: number }[];
  /** World-book demand and supply left over, and the reference the new market would set next turn. */
  nextPrices: {
    commodity: string;
    reference: number;
    next: number;
    unmetUnits: number;
    unsoldUnits: number;
  }[];
}

/** Public purchase lines become funded orders from one public-buyer wallet per country. */
export function publicOrders(
  buyers: readonly { accountId: string; lines: readonly PublicPurchaseLine[] }[],
  referencePrice: (commodity: string, book: string) => number | null,
  priceHeadroom: number
): PurchaseOrder[] {
  const orders: PurchaseOrder[] = [];
  for (const b of buyers)
    for (const l of b.lines) {
      const price = referencePrice(l.commodity, l.book);
      if (price == null || !(price > 0) || !(l.amountLocal > 0)) continue;
      const max = price * priceHeadroom;
      orders.push({
        id: `public:${b.accountId}:${l.commodity}:${l.book}`,
        accountId: b.accountId,
        commodity: l.commodity,
        book: l.book,
        units: l.amountLocal / price,
        maximumUnitPrice: max,
        maximumSpend: l.amountLocal,
      });
    }
  return orders;
}

type ShadowInput = {
  turn: number;
  /** Today's world reference price per commodity (anchor units). */
  references?: Readonly<Record<string, number>>;
  producers: readonly ShadowProducer[];
  skipped: number;
  accounts: readonly MarketAccount[];
  households: readonly HouseholdSpec[];
  publicOrders: readonly PurchaseOrder[];
  /** Funded corporate advertising orders (see marketingBuyerRules.ts). */
  marketingOrders?: readonly PurchaseOrder[];
  /** Construction work on build orders (see capitalSpendRules.ts). */
  investmentOrders?: readonly PurchaseOrder[];
  /** Trade-route eligibility for plant input orders (see routeRules.ts). */
  eligibleOffersByOrder?: Readonly<Record<string, readonly string[]>>;
  /** Unpaid producer bills carried from the previous shadow turn. */
  payables?: readonly ProducerPayable[];
};

export function runProducerShadow(input: ShadowInput): ShadowSummary {
  return runProducerShadowDetailed(input).summary;
}

/** The summary plus the raw settlement, for callers that carry state between turns. */
export function runProducerShadowDetailed(input: ShadowInput): {
  summary: ShadowSummary;
  result: ReturnType<typeof advanceProducerEconomy>;
} {
  const marketingOrders = input.marketingOrders ?? [];
  const investmentOrders = input.investmentOrders ?? [];
  const result = advanceProducerEconomy({
    turn: input.turn,
    accounts: input.accounts,
    payables: input.payables,
    producers: input.producers.map((p) => p.plan),
    households: input.households,
    externalOrders: [...input.publicOrders, ...investmentOrders, ...marketingOrders],
    // Eight passes settle the live world to within 0.02% of 32 (t300 replay:
    // 4,609,920 vs 4,610,514 units) in about 21 s instead of minutes.
    maximumPlanningPasses: SHADOW_PLANNING_PASSES,
    eligibleOffersByOrder: input.eligibleOffersByOrder,
  });
  const receiptById = new Map(result.producers.map((r) => [r.id, r]));
  const byType = new Map<string, ShadowIndustryRow>();
  let legacyLosing = 0;
  let shadowLosing = 0;
  for (const p of input.producers) {
    const r = receiptById.get(p.plan.id);
    const row =
      byType.get(p.sectorType) ??
      ({
        sectorType: p.sectorType,
        plants: 0,
        legacyRevenue: 0,
        legacyProfit: 0,
        legacyLosing: 0,
        shadowRevenue: 0,
        shadowProfit: 0,
        shadowLosing: 0,
      } satisfies ShadowIndustryRow);
    row.plants++;
    if (p.legacy) {
      row.legacyRevenue += p.legacy.revenue;
      row.legacyProfit += p.legacy.profit;
      if (p.legacy.profit < 0) {
        row.legacyLosing++;
        legacyLosing++;
      }
    }
    if (r) {
      row.shadowRevenue += r.revenue;
      row.shadowProfit += r.profit;
      if (r.profit < 0) {
        row.shadowLosing++;
        shadowLosing++;
      }
    }
    byType.set(p.sectorType, row);
  }
  const householdIds = new Set(input.households.map((h) => h.accountId));
  const publicIds = new Set(input.publicOrders.map((o) => o.accountId));
  let householdSpend = 0;
  let publicSpend = 0;
  // Corporations also buy plant inputs from the same account, so marketing
  // spend is counted by order, not by buyer.
  const marketingOrderIds = new Set(marketingOrders.map((o) => o.id));
  let marketingSpend = 0;
  const investmentIds = new Set(investmentOrders.map((o) => o.accountId));
  let investmentSpend = 0;
  for (const t of producerTrades(result.tradeReceipt)) {
    const value = t.units * t.unitPrice;
    if (marketingOrderIds.has(t.orderId)) marketingSpend += value;
    else if (investmentIds.has(t.buyerAccountId)) investmentSpend += value;
    else if (householdIds.has(t.buyerAccountId)) householdSpend += value;
    else if (publicIds.has(t.buyerAccountId)) publicSpend += value;
  }
  const n = input.producers.length;
  const summary: ShadowSummary = {
    turn: input.turn,
    plants: n,
    skipped: input.skipped,
    legacyLosingShare: n > 0 ? legacyLosing / n : 0,
    shadowLosingShare: n > 0 ? shadowLosing / n : 0,
    householdSpend,
    publicSpend,
    marketingSpend,
    investmentSpend,
    industries: [...byType.values()].sort((a, b) => (a.sectorType < b.sectorType ? -1 : 1)),
    nextPrices: (() => {
      // One reference per commodity, answering to every book it trades on:
      // local services and freight settle on state and country books, so a
      // world-only read would freeze their price at the opening reference.
      const unmet = new Map<string, number>();
      for (const o of result.orderOutcomes)
        unmet.set(
          o.commodity,
          (unmet.get(o.commodity) ?? 0) + Math.max(0, o.requestedUnits - o.deliveredUnits)
        );
      const unsold = new Map<string, number>();
      for (const r of result.producers)
        for (const p of r.products)
          unsold.set(p.commodity, (unsold.get(p.commodity) ?? 0) + Math.max(0, p.unsoldUnits));
      const settled = new Map<string, { units: number; value: number }>();
      for (const p of result.prices) {
        if (!(p.units > 0)) continue;
        const s = settled.get(p.commodity) ?? { units: 0, value: 0 };
        s.units += p.units;
        s.value += p.units * p.unitPrice;
        settled.set(p.commodity, s);
      }
      return Object.entries(input.references ?? {})
        .filter(([, ref]) => ref > 0)
        .map(([commodity, reference]) => {
          const s = settled.get(commodity);
          const u = unmet.get(commodity) ?? 0;
          const k = unsold.get(commodity) ?? 0;
          return {
            commodity,
            reference,
            next: nextReferencePrice(reference, {
              settledUnitPrice: s && s.units > 0 ? s.value / s.units : null,
              unmetUnits: u,
              unsoldUnits: k,
              tradedUnits: s?.units ?? 0,
            }),
            unmetUnits: u,
            unsoldUnits: k,
          };
        })
        .sort((a, b) => (a.commodity < b.commodity ? -1 : 1));
    })(),
    prices: result.prices
      .filter((p) => p.book === "world" && p.units > 0)
      .map((p) => ({ commodity: p.commodity, units: p.units, unitPrice: p.unitPrice }))
      .sort((a, b) => (a.commodity < b.commodity ? -1 : 1)),
  };
  return { summary, result };
}
