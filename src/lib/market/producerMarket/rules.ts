import type { ElectricityNetwork, GridMarketSummary } from "@/lib/electricityNetwork/rules/types";
export type RoutedPool = {
  stock: ProducerSupplyPool;
  total: number;
  countries: { offer: ProducerOffer; units: number }[];
  internal: Map<string, { offer: ProducerOffer; units: number }[]>;
};
import { settleProducerOrders } from "@/lib/market/producerMarket/settleProducerOrders";
import type {
  ProducerOffer,
  PurchaseOrder,
  ProducerTradeReceipt,
} from "@/lib/market/producerMarket/producerQuotes";
import {
  eligibleSetOf,
  ownTierOf,
  nonNegative,
  compareId,
} from "@/lib/market/producerMarket/producerQuotes";
export {
  ownTierOf,
  producerTrades,
  ASK_BUYER_TIE_PROFIT_SHARE,
  quoteProducer,
} from "@/lib/market/producerMarket/producerQuotes";
export type {
  ProducerOffer,
  PurchaseOrder,
  ProducerTrade,
  ProducerTradeReceipt,
  ProducerQuotePolicy,
} from "@/lib/market/producerMarket/producerQuotes";
import { ProducerSupplyPool } from "./supplyPoolRules";
import { bookKey } from "./bookKey";
import type { FundedCountryBookRow } from "./fundedBookRules";

/**
 * Every producer sells delivered units at its posted price. Manual, cost-plus
 * and automatic quotes share the same funded order book and trade receipts.
 */

export interface MarketAccount {
  id: string;
  /** Spendable operating cash only. Bank reserves, deposits and loan principal are excluded. */
  cash: number;
}

export interface ProducerFillSpend {
  orderId: string;
  buyerAccountId: string;
  amount: number;
}

/**
 * Settled spend per fill, without expanding supplier-level trades. A fill's
 * supplier legs split its units pro rata, so they sum to the fill's units and
 * its spend is units × price. Consumers that only total spend by buyer or by
 * order use this instead of `producerTrades`, which allocates one trade per
 * supplier per fill.
 */
export function producerFillSpend(receipt: ProducerTradeReceipt): ProducerFillSpend[] {
  const orders = new Map(receipt.orders.map((order) => [order.id, order]));
  return receipt.fills.map((fill) => {
    const order = orders.get(fill.orderId);
    if (!order) throw new Error("Missing producer trade order");
    return {
      orderId: order.id,
      buyerAccountId: order.accountId,
      amount: fill.units * fill.unitPrice,
    };
  });
}

export interface ProducerMarketResult {
  electricity?: GridMarketSummary;
  accounts: MarketAccount[];
  tradeReceipt: ProducerTradeReceipt;
  offers: Array<{
    id: string;
    offeredUnits: number;
    soldUnits: number;
    internalDeliveredUnits: number;
    deliveredUnits: number;
    revenue: number;
    /** Internal accounting income only; it never credits the company wallet. */
    internalValue?: number;
  }>;
  orders: Array<{
    id: string;
    requestedUnits: number;
    deliveredUnits: number;
    cost: number;
    internalCost?: number;
  }>;
  /**
   * Units each own offer handed to each own order, only when
   * `trackInternalDeliveries` is on (captiveMarketValueRules prices them).
   */
  internalDeliveries?: Array<{ offerId: string; orderId: string; units: number }>;
  prices: Array<{
    commodity: string;
    book: string;
    units: number;
    value: number;
    unitPrice: number;
  }>;
  /**
   * Per-country funded book, only when `trackCountryBooks` is on. Supply is
   * offered units, demand is ordered units before any fill, and imports and
   * exports are units that actually changed hands across a border.
   */
  countryBooks?: FundedCountryBookRow[];
  regionalBooks?: import("./fundedBookRules").FundedRegionalBookRow[];
}

function unique<T extends { id: string }>(rows: readonly T[], label: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error(`Duplicate or empty ${label} id`);
    ids.add(row.id);
  }
}

/** One pure clearing pass. Seller receipts, buyer charges and observed prices share the same trades. */
function prepareSettleProducerMarket(input: {
  /** Host-owned deadline, checked within a clearing before any persistent writes. */
  checkBudget?: () => void;
  electricityNetwork?: ElectricityNetwork;
  turn: number;
  accounts: readonly MarketAccount[];
  offers: readonly ProducerOffer[];
  orders: readonly PurchaseOrder[];
  /** Build the per-country funded book from these orders and fills (see fundedBookRules). */
  trackCountryBooks?: boolean;
  /**
   * Units of each order that came from household spillover (spilloverRules).
   * Measurement only: tagged on the tracked country book as
   * `spilloverRequested`, never read by the clearing.
   */
  spilloverUnitsByOrder?: ReadonlyMap<string, number>;
  /**
   * Intra-turn credit per buyer, settled from its own sales before the turn
   * closes (salesAdvanceRules). A buyer may spend past its cash by this much,
   * so its closing cash can be negative; the caller settles it. Absent = none.
   */
  credit?: Readonly<Record<string, number>>;
  /**
   * gameConfig.producerOwnSitesFirstStage >= 1: before any outside order, each
   * company's own sites take its own output, nearest first (same state, same
   * country, anywhere eligible). Absent = the own fill happens only when the
   * company's order comes up in id order.
   */
  ownSitesFirst?: boolean;
  /**
   * Companies that explicitly chose to sell on the market first (supply
   * priority "market"). Their own sites get no head start: outside buyers clear
   * first, then their own orders take what is left of their own output, free,
   * and buy any remaining need from other sellers.
   */
  marketFirstAccounts?: readonly string[];
  /** Report units moved between a company's own sites, per offer and order. */
  trackInternalDeliveries?: boolean;
}) {
  input.checkBudget?.();
  if (!Number.isSafeInteger(input.turn) || input.turn < 0) throw new Error("Invalid market turn");
  unique(input.accounts, "account");
  unique(input.offers, "offer");
  unique(input.orders, "order");
  // Route lists are shared by commodity/country. Do not rebuild the same large
  // set for each plant and each own-stock/ordinary/fair allocation pass.
  const supplierIds = new WeakMap<readonly ProducerOffer[], string[]>();
  const idsForSuppliers = (suppliers: readonly ProducerOffer[]) => {
    let ids = supplierIds.get(suppliers);
    if (!ids) {
      ids = suppliers.map((offer) => offer.id);
      supplierIds.set(suppliers, ids);
    }
    return ids;
  };
  const cash = new Map(input.accounts.map((a) => [a.id, nonNegative(a.cash, "operating cash")]));
  // Opening budgets prevent a circular chain of unfunded sales from financing itself.
  const budgets = new Map(cash);
  const floors = new Map<string, number>();
  for (const [id, line] of Object.entries(input.credit ?? {})) {
    if (!cash.has(id)) throw new Error("Unknown credit account");
    const amount = nonNegative(line, "intra-turn credit");
    if (amount > 0) {
      budgets.set(id, budgets.get(id)! + amount);
      floors.set(id, -amount);
    }
  }
  const debit = (id: string, amount: number) =>
    cash.set(id, Math.max(floors.get(id) ?? 0, cash.get(id)! - amount));
  const credited = (id: string, amount: number) => {
    const next = cash.get(id)! + amount;
    const floor = floors.get(id);
    if (floor == null) return nonNegative(next, "closing seller cash");
    if (!Number.isFinite(next) || next < floor - Math.max(1e-9, -floor * 1e-12))
      throw new Error("Invalid closing seller cash");
    return next;
  };
  const poolByOffer = new Map<string, ProducerSupplyPool>();
  const poolsByBook = new Map<string, Map<number, ProducerSupplyPool>>();
  // Offers behind each pooled price level, so a pooled fill can name the
  // sellers it drew from without changing the fill's own granularity.
  const offersByPool = new Map<ProducerSupplyPool, ProducerOffer[]>();
  const ownByBook = new Map<string, Map<string, ProducerOffer[]>>();
  const remaining = {
    get: (id: string) => poolByOffer.get(id)!.remaining(id),
    set: (id: string, units: number) => poolByOffer.get(id)!.setRemaining(id, units),
  };
  // Country books are optional: the shadow and planning passes settle without
  // them, and only the final funded settlement pays for the extra pass.
  const tracked = input.trackCountryBooks === true;
  const internalDeliveries = input.trackInternalDeliveries
    ? new Map<string, { offerId: string; orderId: string; units: number }>()
    : null;
  const recordInternal = (offer: ProducerOffer, order: PurchaseOrder, units: number): void => {
    if (!internalDeliveries || !(units > 0)) return;
    const key = JSON.stringify([offer.id, order.id]);
    const row = internalDeliveries.get(key) ?? { offerId: offer.id, orderId: order.id, units: 0 };
    row.units += units;
    internalDeliveries.set(key, row);
  };
  const countryBookRows = new Map<string, FundedCountryBookRow>();
  const regionalBookRows = new Map<string, import("./fundedBookRules").FundedRegionalBookRow>();
  const regionalBookRow = (order: PurchaseOrder) => {
    const stateId = order.book.startsWith("state:") ? order.book.slice(6) : order.stateId;
    if (!stateId) return undefined;
    const key = JSON.stringify([stateId, order.commodity]);
    let row = regionalBookRows.get(key);
    if (!row) {
      row = { stateId, commodity: order.commodity, funded: 0, filled: 0 };
      regionalBookRows.set(key, row);
    }
    return row;
  };
  const countryBookRow = (countryId: string, commodity: string): FundedCountryBookRow => {
    const key = JSON.stringify([countryId, commodity]);
    let row = countryBookRows.get(key);
    if (!row) {
      row = { countryId, commodity, supply: 0, demand: 0, imports: 0, exports: 0 };
      countryBookRows.set(key, row);
    }
    return row;
  };
  // Seller and buyer country pairs, accumulated atomically with the fill that
  // moves the goods, so the book reports executed cross-border units rather
  // than inferring them from a national balance.
  const deliveredAcross = new Map<string, number>();
  const recordInternalValue = (offer: ProducerOffer, order: PurchaseOrder, units: number): void => {
    if (
      order.internalAccountingSiteId &&
      offer.accountId === order.accountId &&
      (offer.internalUnitPrice ?? 0) > 0 &&
      units > 0
    ) {
      const amount = units * offer.internalUnitPrice!;
      if (!Number.isFinite(amount)) throw new Error("Invalid internal supply value");
      const seller = offerResults.get(offer.id)!;
      const buyer = orderResults.get(order.id)!;
      seller.internalValue = (seller.internalValue ?? 0) + amount;
      buyer.internalCost = (buyer.internalCost ?? 0) + amount;
    }
  };
  const recordCrossCountry = (
    seller: string | undefined,
    order: PurchaseOrder,
    units: number
  ): void => {
    if (!tracked || !(units > 0)) return;
    const buyer = order.countryId;
    if (!seller || !buyer || seller === buyer) return;
    const key = JSON.stringify([seller, buyer, order.commodity]);
    deliveredAcross.set(key, (deliveredAcross.get(key) ?? 0) + units);
  };
  const recordDelivery = (offer: ProducerOffer, order: PurchaseOrder, units: number): void => {
    recordInternalValue(offer, order, units);
    recordCrossCountry(offer.countryId, order, units);
  };
  const sellerCountries = new WeakMap<readonly ProducerOffer[], string | null>();
  const sellerCountryOf = (rows: readonly ProducerOffer[]): string | undefined => {
    if (sellerCountries.has(rows)) return sellerCountries.get(rows) ?? undefined;
    let country: string | undefined;
    for (const offer of rows) {
      if (!offer.countryId || (country !== undefined && country !== offer.countryId)) {
        sellerCountries.set(rows, null);
        return undefined;
      }
      if (country === undefined) country = offer.countryId;
    }
    sellerCountries.set(rows, country ?? null);
    return country;
  };
  const fillsWithCountries = (
    order: PurchaseOrder,
    fill: ProducerTradeReceipt["fills"][number],
    sellers: readonly ProducerOffer[]
  ): ProducerTradeReceipt["fills"][number] => {
    const sellerCountry = sellerCountryOf(sellers);
    return {
      ...fill,
      ...(sellerCountry ? { sellerCountry } : {}),
      ...(order.countryId ? { buyerCountry: order.countryId } : {}),
    };
  };
  const offered = new Map<string, number>();
  const byBook = new Map<string, ProducerOffer[]>();
  for (const offer of input.offers) {
    if (!cash.has(offer.accountId)) throw new Error("Unknown seller account");
    nonNegative(offer.unitPrice, "offer price");
    if (offer.internalUnitPrice != null)
      nonNegative(offer.internalUnitPrice, "internal offer price");
    const units = nonNegative(offer.units, "offer units");
    const available = Math.min(
      units,
      offer.deliverableUnits == null
        ? units
        : nonNegative(offer.deliverableUnits, "delivery ceiling")
    );
    offered.set(offer.id, available);
    if (tracked && offer.countryId)
      countryBookRow(offer.countryId, offer.commodity).supply += available;
    const key = bookKey(offer.commodity, offer.book);
    const levels = poolsByBook.get(key) ?? new Map<number, ProducerSupplyPool>();
    const pool = levels.get(offer.unitPrice) ?? new ProducerSupplyPool();
    pool.add(offer.id, available);
    const pooledOffers = offersByPool.get(pool) ?? [];
    pooledOffers.push(offer);
    offersByPool.set(pool, pooledOffers);
    levels.set(offer.unitPrice, pool);
    poolsByBook.set(key, levels);
    poolByOffer.set(offer.id, pool);
    const owners = ownByBook.get(key) ?? new Map<string, ProducerOffer[]>();
    const owned = owners.get(offer.accountId) ?? [];
    owned.push(offer);
    owners.set(offer.accountId, owned);
    ownByBook.set(key, owners);
    const rows = byBook.get(key) ?? [];
    rows.push(offer);
    byBook.set(key, rows);
  }
  for (const rows of byBook.values())
    rows.sort((a, b) => a.unitPrice - b.unitPrice || compareId(a.id, b.id));
  for (const owners of ownByBook.values())
    for (const rows of owners.values())
      rows.sort((a, b) => a.unitPrice - b.unitPrice || compareId(a.id, b.id));
  const sortedPoolsByBook = new Map(
    [...poolsByBook].map(([key, pools]) => [key, [...pools].sort(([a], [b]) => a - b)])
  );
  const quantityGroups = new Map<
    string,
    {
      accountId: string;
      commodity: string;
      book: string;
      maximumUnits: number;
      countryId?: string;
      remaining: number;
    }
  >();
  for (const order of input.orders) {
    if (!cash.has(order.accountId)) throw new Error("Unknown buyer account");
    nonNegative(order.units, "order units");
    nonNegative(order.maximumUnitPrice, "limit price");
    if (order.contractUnitPrice != null) {
      nonNegative(order.contractUnitPrice, "contract price");
      if (!order.supplierOfferId || order.contractUnitPrice > order.maximumUnitPrice)
        throw new Error("Contract price requires a named supplier within the buyer limit");
    }
    if (order.quantityGroup) {
      const { id, maximumUnits } = order.quantityGroup;
      nonNegative(maximumUnits, "group quantity");
      if (!id) throw new Error("Missing purchase group identity");
      const prior = quantityGroups.get(id);
      if (
        prior &&
        (prior.accountId !== order.accountId ||
          prior.commodity !== order.commodity ||
          prior.book !== order.book ||
          prior.maximumUnits !== maximumUnits ||
          prior.countryId !== order.countryId)
      )
        throw new Error("Inconsistent purchase group");
      if (!prior)
        quantityGroups.set(id, {
          accountId: order.accountId,
          commodity: order.commodity,
          book: order.book,
          maximumUnits,
          countryId: order.countryId,
          remaining: maximumUnits,
        });
    }
    if (order.maximumSpend != null) nonNegative(order.maximumSpend, "order spending limit");
    if (order.priority != null && !Number.isFinite(order.priority))
      throw new Error("Invalid priority");
    if (order.spendGroup) nonNegative(order.spendGroup.maximumSpend, "spend group limit");
    // A lower demand-curve step is counted once settled, for what it bought.
    if (tracked && order.countryId && !(order.demandStep && order.demandStep > 0))
      countryBookRow(order.countryId, order.commodity).demand += order.units;
  }
  // Lower demand-curve steps are demand only at their own lower price, so they
  // stay out of the requested and funded measure; what they buy is added once
  // settled, below.
  if (tracked)
    fundedDemandByCountry(
      input.orders.filter((o) => !(o.demandStep && o.demandStep > 0)),
      budgets,
      countryBookRow,
      input.spilloverUnitsByOrder,
      (order, units) => {
        const row = regionalBookRow(order);
        if (row) row.funded += units;
      }
    );
  // Shared budgets for spend groups: what every order in the group may still spend.
  const spendGroupLeft = new Map<string, number>();
  for (const order of input.orders)
    if (order.spendGroup && !spendGroupLeft.has(order.spendGroup.id))
      spendGroupLeft.set(order.spendGroup.id, order.spendGroup.maximumSpend);
  const groupBudget = (order: PurchaseOrder): number =>
    order.spendGroup ? (spendGroupLeft.get(order.spendGroup.id) ?? 0) : Number.MAX_VALUE;
  const spendFromGroup = (order: PurchaseOrder, amount: number): void => {
    if (!order.spendGroup || !(amount > 0)) return;
    const left = spendGroupLeft.get(order.spendGroup.id) ?? 0;
    spendGroupLeft.set(order.spendGroup.id, Math.max(0, left - amount));
  };
  const orderResults = new Map<string, ProducerMarketResult["orders"][number]>(
    input.orders.map((o) => [
      o.id,
      { id: o.id, requestedUnits: o.units, deliveredUnits: 0, cost: 0 },
    ])
  );
  const offerResults = new Map<string, ProducerMarketResult["offers"][number]>(
    input.offers.map((o) => [
      o.id,
      {
        id: o.id,
        offeredUnits: offered.get(o.id)!,
        soldUnits: 0,
        internalDeliveredUnits: 0,
        deliveredUnits: 0,
        revenue: 0,
      },
    ])
  );
  const fills: ProducerTradeReceipt["fills"] = [];
  let tradeCount = 0;
  const prices = new Map<string, ProducerMarketResult["prices"][number]>();
  const orders = [...input.orders].sort(compareOrders);
  // State-first freight: a local buyer clears against its own state's offers
  // before the national book pass, so a remote buyer sorted earlier cannot
  // take the stock a local buyer needs. Indexed per book and state in the
  // book's (price, id) order.
  const freightByState = new Map<string, Map<string, Map<number, ProducerOffer[]>>>();
  for (const offer of input.offers) {
    if (offer.commodity !== "freight" || !offer.stateId) continue;
    const key = bookKey(offer.commodity, offer.book);
    const byState = freightByState.get(key) ?? new Map<string, Map<number, ProducerOffer[]>>();
    const byPrice = byState.get(offer.stateId) ?? new Map<number, ProducerOffer[]>();
    const level = byPrice.get(offer.unitPrice) ?? [];
    level.push(offer);
    byPrice.set(offer.unitPrice, level);
    byState.set(offer.stateId, byPrice);
    freightByState.set(key, byState);
  }
  for (const byState of freightByState.values())
    for (const byPrice of byState.values())
      for (const level of byPrice.values()) level.sort((a, b) => compareId(a.id, b.id));
  // Home-country-first (producerPublicHomeFirstStage): a flagged order clears
  // its own country's sellers before the ordinary pass. Without it a scarce
  // world book went to buyers in order-id order, which for public buyers is
  // their country code: AT to JP bought out the United States' own ordnance
  // before the US order came up. Indexed only when some order is flagged.
  const homeByCountry = new Map<string, Map<string, Map<number, ProducerOffer[]>>>();
  if (input.orders.some((order) => order.homeCountryFirst && order.countryId)) {
    for (const offer of input.offers) {
      if (!offer.countryId) continue;
      const key = bookKey(offer.commodity, offer.book);
      const byCountry = homeByCountry.get(key) ?? new Map<string, Map<number, ProducerOffer[]>>();
      const byPrice = byCountry.get(offer.countryId) ?? new Map<number, ProducerOffer[]>();
      const level = byPrice.get(offer.unitPrice) ?? [];
      level.push(offer);
      byPrice.set(offer.unitPrice, level);
      byCountry.set(offer.countryId, byPrice);
      homeByCountry.set(key, byCountry);
    }
    for (const byCountry of homeByCountry.values())
      for (const byPrice of byCountry.values())
        for (const level of byPrice.values()) level.sort((a, b) => compareId(a.id, b.id));
  }
  /** The state-first pass for one freight order: its own state's offers only. */
  const fillStateFreight = (
    order: PurchaseOrder,
    openingWanted: number,
    openingBudget: number
  ): { wanted: number; orderBudget: number } => {
    const wanted = openingWanted;
    const orderBudget = openingBudget;
    // A named supplier, a contract or an eligibility filter keeps its ordinary
    // pass: it has no free choice of sellers to reorder.
    const stateId = order.stateId;
    if (
      !stateId ||
      order.eligibleOfferIds ||
      order.supplierOfferId ||
      order.contractUnitPrice != null
    )
      return { wanted, orderBudget };
    const byPrice = freightByState.get(bookKey(order.commodity, order.book))?.get(stateId);
    if (!byPrice) return { wanted, orderBudget };
    return fillLocalOffers(order, wanted, orderBudget, byPrice, { sellerState: stateId });
  };
  /**
   * Clears one order against a subset of its book (one state's freight, or the
   * buyer's own country), cheapest level first, pro rata within a level. The
   * fill carries the subset's tag so the receipt replays the same sellers.
   */
  const fillLocalOffers = (
    order: PurchaseOrder,
    openingWanted: number,
    openingBudget: number,
    byPrice: ReadonlyMap<number, readonly ProducerOffer[]>,
    tag: { sellerState: string } | { homeCountry: true } | { spillBook: string },
    eligible: ReadonlySet<string> | null = null
  ): { wanted: number; orderBudget: number } => {
    let wanted = openingWanted;
    let orderBudget = openingBudget;
    const quantityGroup = order.quantityGroup && quantityGroups.get(order.quantityGroup.id);
    // A spill fill is a sale in the seller's book, so price discovery stays per book.
    const tradeBook = "spillBook" in tag ? tag.spillBook : order.book;
    const key = bookKey(order.commodity, tradeBook);
    for (const [price, offers] of [...byPrice].sort(([a], [b]) => a - b)) {
      if (!(wanted > 0) || price > order.maximumUnitPrice) break;
      const rows = offers.filter(
        (offer) => offer.accountId !== order.accountId && (!eligible || eligible.has(offer.id))
      );
      const total = rows.reduce((sum, offer) => sum + remaining.get(offer.id), 0);
      const budget = Math.min(budgets.get(order.accountId)!, orderBudget, groupBudget(order));
      const take = Math.min(wanted, total, price > 0 ? budget / price : wanted);
      if (!(take > 0)) continue;
      const amount = take * price;
      if (!Number.isFinite(amount)) throw new Error("Non-finite trade value");
      fills.push(
        fillsWithCountries(
          order,
          { orderId: order.id, kind: "sale", unitPrice: price, units: take, ...tag },
          rows
        )
      );
      const observed = prices.get(key) ?? {
        commodity: order.commodity,
        book: tradeBook,
        units: 0,
        value: 0,
        unitPrice: 0,
      };
      observed.units += take;
      observed.value += amount;
      observed.unitPrice = observed.value / observed.units;
      prices.set(key, observed);
      const buyer = orderResults.get(order.id)!;
      buyer.deliveredUnits += take;
      buyer.cost += amount;
      for (const offer of rows) {
        const available = remaining.get(offer.id);
        const units = Math.min(available, (take / total) * available);
        if (!(units > 0)) continue;
        recordDelivery(offer, order, units);
        tradeCount++;
        remaining.set(offer.id, Math.max(0, available - units));
        wanted = Math.max(0, wanted - units);
        if (quantityGroup) quantityGroup.remaining = Math.max(0, quantityGroup.remaining - units);
        const spent = units * price;
        orderBudget = Math.max(0, orderBudget - spent);
        budgets.set(order.accountId, Math.max(0, budgets.get(order.accountId)! - spent));
        spendFromGroup(order, spent);
        debit(order.accountId, spent);
        cash.set(offer.accountId, credited(offer.accountId, spent));
        const seller = offerResults.get(offer.id)!;
        seller.soldUnits += units;
        seller.deliveredUnits += units;
        seller.revenue += spent;
      }
    }
    return { wanted, orderBudget };
  };
  const carried = new Map<string, { wanted: number; orderBudget: number }>();
  // Phase 0 (ownSitesFirst): a company's own sites take its own output before
  // any outside order, nearest first. Without it the own fill below runs only
  // when the company's order comes up in id order, so an outside order sorted
  // earlier could buy the stock out (tickets 1755, 1757). Named suppliers,
  // contracts and reservation groups keep their ordinary pass: agreements
  // reserve before own supply.
  const marketFirst = new Set(input.marketFirstAccounts ?? []);
  if (input.ownSitesFirst) {
    for (const order of orders) {
      if (input.electricityNetwork?.mode === "enforced" && order.commodity === "energy") continue;
      if (order.supplierOfferId || order.contractUnitPrice != null || order.quantityGroup) continue;
      if (marketFirst.has(order.accountId)) continue;
      const eligible = eligibleSetOf(order) ?? null;
      const ownAll = (
        ownByBook.get(bookKey(order.commodity, order.book))?.get(order.accountId) ?? []
      ).filter((offer) => !eligible || eligible.has(offer.id));
      const skipOutsideFirst = ownAll.some((offer) => offer.sellOutsideFirst);
      const own = skipOutsideFirst ? ownAll.filter((offer) => !offer.sellOutsideFirst) : ownAll;
      if (own.length === 0) continue;
      let wanted = order.units;
      for (const ownTier of [0, 1, 2] as const) {
        const tier = own.filter((offer) => ownTierOf(order, offer) === ownTier);
        if (!(wanted > 0)) break;
        const total = tier.reduce((sum, offer) => sum + remaining.get(offer.id), 0);
        const take = Math.min(wanted, total);
        if (!(take > 0)) continue;
        fills.push(
          fillsWithCountries(
            order,
            {
              orderId: order.id,
              kind: "internalTransfer",
              unitPrice: 0,
              units: take,
              ownTier,
              ...(skipOutsideFirst ? { skipOutsideFirst: true as const } : {}),
            },
            tier
          )
        );
        for (const offer of tier) {
          const available = remaining.get(offer.id);
          const units = Math.min(available, (take / total) * available);
          if (!(units > 0)) continue;
          recordDelivery(offer, order, units);
          remaining.set(offer.id, Math.max(0, available - units));
          const seller = offerResults.get(offer.id)!;
          seller.internalDeliveredUnits += units;
          recordInternal(offer, order, units);
          seller.deliveredUnits += units;
          tradeCount++;
        }
        orderResults.get(order.id)!.deliveredUnits += take;
        wanted = Math.max(0, wanted - take);
      }
      if (wanted < order.units)
        carried.set(order.id, { wanted, orderBudget: order.maximumSpend ?? Number.MAX_VALUE });
    }
  }
  // Phase 1: every freight order with a state clears its own state's offers
  // first, carrying its residual target and budget into the ordinary pass.
  for (const order of orders) {
    if (order.commodity !== "freight" || !order.stateId) continue;
    const quantityGroup = order.quantityGroup && quantityGroups.get(order.quantityGroup.id);
    const prior = carried.get(order.id);
    const wanted = prior
      ? prior.wanted
      : Math.min(order.units, quantityGroup?.remaining ?? order.units);
    carried.set(
      order.id,
      fillStateFreight(order, wanted, prior?.orderBudget ?? order.maximumSpend ?? Number.MAX_VALUE)
    );
  }
  // Phase 1b: flagged orders clear their own country's sellers first, carrying
  // the residual target and budget into the ordinary pass. Named suppliers and
  // contracts keep their ordinary pass.
  if (homeByCountry.size > 0) {
    for (const order of orders) {
      if (input.electricityNetwork?.mode === "enforced" && order.commodity === "energy") continue;
      if (!order.homeCountryFirst || !order.countryId) continue;
      if (order.supplierOfferId || order.contractUnitPrice != null) continue;
      const byPrice = homeByCountry.get(bookKey(order.commodity, order.book))?.get(order.countryId);
      if (!byPrice) continue;
      const quantityGroup = order.quantityGroup && quantityGroups.get(order.quantityGroup.id);
      const prior = carried.get(order.id);
      const wanted = prior
        ? prior.wanted
        : Math.min(order.units, quantityGroup?.remaining ?? order.units);
      carried.set(
        order.id,
        fillLocalOffers(
          order,
          wanted,
          prior?.orderBudget ?? order.maximumSpend ?? Number.MAX_VALUE,
          byPrice,
          { homeCountry: true },
          eligibleSetOf(order) ?? null
        )
      );
    }
  }
  /** The ordinary pass's own-stock fill: the buyer's own offers at no price, pro rata. */
  const fillOwnStock = (order: PurchaseOrder, wanted: number): number => {
    const eligible = eligibleSetOf(order);
    const own = (
      ownByBook.get(bookKey(order.commodity, order.book))?.get(order.accountId) ?? []
    ).filter((offer) => !eligible || eligible.has(offer.id));
    const ownTotal = own.reduce((sum, offer) => sum + remaining.get(offer.id), 0);
    const ownTake = Math.min(wanted, ownTotal);
    if (!(ownTake > 0)) return 0;
    fills.push(
      fillsWithCountries(
        order,
        { orderId: order.id, kind: "internalTransfer", unitPrice: 0, units: ownTake },
        own
      )
    );
    const fraction = ownTake / ownTotal;
    for (const offer of own) {
      const available = remaining.get(offer.id);
      const units = Math.min(available, fraction * available);
      if (!(units > 0)) continue;
      recordDelivery(offer, order, units);
      remaining.set(offer.id, Math.max(0, available - units));
      const seller = offerResults.get(offer.id)!;
      seller.internalDeliveredUnits += units;
      recordInternal(offer, order, units);
      seller.deliveredUnits += units;
      tradeCount++;
    }
    orderResults.get(order.id)!.deliveredUnits += ownTake;
    return ownTake;
  };
  /**
   * One ordinary pooled purchase: `take` units of one price level, drawn pro
   * rata across its sellers. Charges the buyer's account and spend group and
   * returns the amount; the caller tracks its own target and order budget.
   * Routed allocations name an exact supplier subset instead of the whole pool.
   */

  const buyFromPool = (
    order: PurchaseOrder,
    price: number,
    pool: ProducerSupplyPool,
    take: number,
    suppliers?: readonly ProducerOffer[],
    supplierTotal?: number,
    routedPool?: RoutedPool
  ): number => {
    input.checkBudget?.();
    const key = bookKey(order.commodity, order.book);
    const amount = take * price;
    if (!Number.isFinite(amount)) throw new Error("Non-finite trade value");
    const poolOffers = suppliers ?? offersByPool.get(pool) ?? [];
    const poolTotal = suppliers
      ? (supplierTotal ?? suppliers.reduce((n, offer) => n + remaining.get(offer.id), 0))
      : pool.total;
    if (routedPool) {
      tradeCount += routedPool.stock.activeCount;
      if (tracked) {
        for (const row of routedPool.countries)
          recordCrossCountry(row.offer.countryId, order, take * (row.units / routedPool.total));
        for (const row of routedPool.internal.get(order.accountId) ?? [])
          recordInternalValue(row.offer, order, take * (row.units / routedPool.total));
      }
      routedPool.stock.take(take);
    } else if (!suppliers) tradeCount += pool.activeCount;
    if (tracked && !suppliers && !routedPool) {
      // `take` draws pro rata on remaining units, so each offer's share of
      // this order is its remaining units over the pool total.
      for (const offer of poolOffers) {
        const available = remaining.get(offer.id);
        if (available > 0) recordDelivery(offer, order, take * (available / poolTotal));
      }
    }
    if (suppliers && !routedPool) {
      for (const supplier of suppliers) {
        const available = remaining.get(supplier.id);
        if (available > 0) tradeCount++;
        if (tracked && available > 0)
          recordDelivery(supplier, order, take * (available / poolTotal));
        const units = Math.min(available, take * (available / poolTotal));
        if (!(units > 0)) continue;
        remaining.set(supplier.id, Math.max(0, available - units));
        const seller = offerResults.get(supplier.id)!;
        seller.soldUnits += units;
        seller.deliveredUnits += units;
        seller.revenue += units * price;
        cash.set(supplier.accountId, credited(supplier.accountId, units * price));
      }
    } else if (!routedPool) pool.take(take);
    fills.push(
      fillsWithCountries(
        order,
        {
          orderId: order.id,
          kind: "sale",
          unitPrice: price,
          units: take,
          ...(suppliers ? { supplierOfferIds: idsForSuppliers(suppliers) } : {}),
        },
        poolOffers
      )
    );
    budgets.set(order.accountId, Math.max(0, budgets.get(order.accountId)! - amount));
    spendFromGroup(order, amount);
    debit(order.accountId, amount);
    const buyer = orderResults.get(order.id)!;
    buyer.deliveredUnits += take;
    buyer.cost += amount;
    const observed = prices.get(key) ?? {
      commodity: order.commodity,
      book: order.book,
      units: 0,
      value: 0,
      unitPrice: 0,
    };
    observed.units += take;
    observed.value += amount;
    observed.unitPrice = observed.value / observed.units;
    prices.set(key, observed);
    return amount;
  };
  // Fair share: producer inputs and enabled public orders of one priority
  // on one book clear each price level together, pro rata to what each still
  // wants, instead of one by one in id order (for public buyers, alphabetical
  // by country code). Route filters constrain each supplier allocation; named
  // suppliers and contracts keep their ordinary pass. A group of one keeps
  // the ordinary path.
  const fairGroupOf = new Map<string, PurchaseOrder[]>();
  {
    const groups = new Map<string, PurchaseOrder[]>();
    for (const order of orders) {
      if (!order.fairShare || order.supplierOfferId) continue;
      if (order.contractUnitPrice != null) continue;
      const key = JSON.stringify([
        order.commodity,
        order.book,
        order.priority ?? 0,
        marketFirst.has(order.accountId),
      ]);
      const group = groups.get(key) ?? [];
      group.push(order);
      groups.set(key, group);
    }
    for (const group of groups.values())
      if (group.length > 1) for (const order of group) fairGroupOf.set(order.id, group);
  }
  return {
    kind: "context" as const,
    context: {
      budgets,
      buyFromPool,
      byBook,
      carried,
      cash,
      countryBookRow,
      countryBookRows,
      credited,
      debit,
      deliveredAcross,
      fairGroupOf,
      filledByCountry,
      fillOwnStock,
      fillLocalOffers,
      fills,
      fillsWithCountries,
      groupBudget,
      input,
      internalDeliveries,
      marketFirst,
      offerResults,
      offersByPool,
      orderResults,
      orders,
      poolByOffer,
      prices,
      quantityGroups,
      recordDelivery,
      recordInternal,
      regionalBookRow,
      regionalBookRows,
      remaining,
      sortedPoolsByBook,
      spendFromGroup,
      tracked,
      get tradeCount() {
        return tradeCount;
      },
      set tradeCount(value: typeof tradeCount) {
        tradeCount = value;
      },
    },
  };
}
export type SettleProducerMarketStageContext = Extract<
  ReturnType<typeof prepareSettleProducerMarket>,
  { kind: "context" }
>["context"];

export function settleProducerMarket(
  ...args: Parameters<typeof prepareSettleProducerMarket>
): ProducerMarketResult {
  const prepared = prepareSettleProducerMarket(...args);
  return settleProducerOrders(prepared.context);
}

/**
 * Settlement order: higher priority first, named suppliers before open
 * orders, then id. The funded pass walks orders in this order so the budget
 * an account spends on one order is the budget it no longer has for the next.
 */
const compareOrders = (a: PurchaseOrder, b: PurchaseOrder) =>
  (b.priority ?? 0) - (a.priority ?? 0) ||
  Number(!!b.supplierOfferId) - Number(!!a.supplierOfferId) ||
  compareId(a.id, b.id);

/**
 * Requested and budget-backed units per buyer country. Measurement only:
 * reads opening budgets and never changes a fill.
 *
 * Requested counts a reservation group once, at most its target. Funded walks
 * orders in settlement order against one shared budget per account (opening
 * cash plus intra-turn credit), each order paying its contract or limit
 * price, capped by its own spending limit and its group's remaining target.
 * Funded is a lower bound at the prices buyers bid.
 */
function fundedDemandByCountry(
  orders: readonly PurchaseOrder[],
  openingBudgets: ReadonlyMap<string, number>,
  row: (countryId: string, commodity: string) => FundedCountryBookRow,
  spilloverUnits?: ReadonlyMap<string, number>,
  onFunded?: (order: PurchaseOrder, units: number) => void
): void {
  const budget = new Map(openingBudgets);
  const groupTarget = new Map<string, number>();
  const groupAsked = new Map<string, number>();
  for (const order of orders) {
    if (!order.quantityGroup) continue;
    const id = order.quantityGroup.id;
    groupTarget.set(id, order.quantityGroup.maximumUnits);
    groupAsked.set(id, (groupAsked.get(id) ?? 0) + order.units);
  }
  const groupCounted = new Set<string>();
  const groupLeft = new Map(groupTarget);
  for (const order of [...orders].sort(compareOrders)) {
    if (!order.countryId) continue;
    const book = row(order.countryId, order.commodity);
    const group = order.quantityGroup?.id;
    if (group === undefined) {
      book.requested = (book.requested ?? 0) + order.units;
      const spilled = Math.min(order.units, spilloverUnits?.get(order.id) ?? 0);
      if (spilled > 0) book.spilloverRequested = (book.spilloverRequested ?? 0) + spilled;
    } else if (!groupCounted.has(group)) {
      groupCounted.add(group);
      book.requested =
        (book.requested ?? 0) + Math.min(groupTarget.get(group)!, groupAsked.get(group)!);
    }
    const price = order.contractUnitPrice ?? order.maximumUnitPrice;
    let units = order.units;
    if (group !== undefined) units = Math.min(units, groupLeft.get(group)!);
    if (price > 0) {
      if (order.maximumSpend != null) units = Math.min(units, order.maximumSpend / price);
      units = Math.min(units, Math.max(0, budget.get(order.accountId) ?? 0) / price);
    }
    units = Math.max(0, units);
    book.funded = (book.funded ?? 0) + units;
    onFunded?.(order, units);
    if (price > 0) budget.set(order.accountId, (budget.get(order.accountId) ?? 0) - units * price);
    if (group !== undefined) groupLeft.set(group, groupLeft.get(group)! - units);
  }
}

/** Units buyers in each country received, added to the tracked rows. */
function filledByCountry(
  orders: readonly PurchaseOrder[],
  results: ReadonlyMap<string, ProducerMarketResult["orders"][number]>,
  row: (countryId: string, commodity: string) => FundedCountryBookRow,
  rows: ReadonlyMap<string, FundedCountryBookRow>
): FundedCountryBookRow[] {
  for (const order of orders) {
    if (!order.countryId) continue;
    const delivered = results.get(order.id)?.deliveredUnits ?? 0;
    const book = row(order.countryId, order.commodity);
    book.filled = (book.filled ?? 0) + delivered;
  }
  return [...rows.values()];
}
