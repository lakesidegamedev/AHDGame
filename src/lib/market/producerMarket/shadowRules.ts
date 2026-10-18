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
  industries: ShadowIndustryRow[];
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

export function runProducerShadow(input: {
  turn: number;
  producers: readonly ShadowProducer[];
  skipped: number;
  accounts: readonly MarketAccount[];
  households: readonly HouseholdSpec[];
  publicOrders: readonly PurchaseOrder[];
  /** Trade-route eligibility for plant input orders (see routeRules.ts). */
  eligibleOffersByOrder?: Readonly<Record<string, readonly string[]>>;
}): ShadowSummary {
  const result = advanceProducerEconomy({
    turn: input.turn,
    accounts: input.accounts,
    producers: input.producers.map((p) => p.plan),
    households: input.households,
    externalOrders: input.publicOrders,
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
  for (const t of producerTrades(result.tradeReceipt)) {
    const value = t.units * t.unitPrice;
    if (householdIds.has(t.buyerAccountId)) householdSpend += value;
    else if (publicIds.has(t.buyerAccountId)) publicSpend += value;
  }
  const n = input.producers.length;
  return {
    turn: input.turn,
    plants: n,
    skipped: input.skipped,
    legacyLosingShare: n > 0 ? legacyLosing / n : 0,
    shadowLosingShare: n > 0 ? shadowLosing / n : 0,
    householdSpend,
    publicSpend,
    industries: [...byType.values()].sort((a, b) => (a.sectorType < b.sectorType ? -1 : 1)),
  };
}
