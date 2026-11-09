import { ProducerSupplyPool } from "./supplyPoolRules";
import { bookKey } from "./bookKey";
import type { FundedCountryBookRow } from "./fundedBookRules";
import { sortFundedCountryBookRows } from "./fundedBookRules";
import { nextAutoAsk } from "./autoAskRules";
import { capSharedShares, proRataShares } from "./publicFairShareRules";
/**
 * Every producer sells delivered units at its posted price. Manual, cost-plus
 * and automatic quotes share the same funded order book and trade receipts.
 */

export interface MarketAccount {
  id: string;
  /** Spendable operating cash only. Bank reserves, deposits and loan principal are excluded. */
  cash: number;
}

export interface ProducerOffer {
  id: string;
  accountId: string;
  commodity: string;
  book: string;
  units: number;
  unitPrice: number;
  /** Management-account value for own-site deliveries; never a cash price. */
  internalUnitPrice?: number;
  /** A binding delivery ceiling, independent of the asking price. */
  deliverableUnits?: number;
  /** Country the selling site is in; the funded book places supply here. */
  countryId?: string;
  /** State the selling site is in; freight clears against local demand first. */
  stateId?: string;
  /**
   * This site sells to outside buyers before the company's own plants. Own-sites-first skips the offer; whatever outside buyers leave still reaches the own plants free, in the ordinary pass.
   */
  sellOutsideFirst?: true;
}

export interface PurchaseOrder {
  id: string;
  /** Receiving plant for matched site accounting; non-plant purchases omit it. */
  internalAccountingSiteId?: string;
  accountId: string;
  commodity: string;
  book: string;
  units: number;
  maximumUnitPrice: number;
  /** Reserved cash budget for this order, shared with the account's other orders. */
  maximumSpend?: number;
  /** Named supplier reservations compete for the same stock and budget as public purchases. */
  supplierOfferId?: string;
  /** A validated supplier contract fixes the price while sharing the public offer's stock. */
  contractUnitPrice?: number;
  /** Optional eligible suppliers implement embargoes, routes and local-service scope. */
  eligibleOfferIds?: readonly string[];
  /** Reserved orders precede public orders. Equal priority uses id order unless fairShare is set. */
  priority?: number;
  /** Reservations and their public fallback share one physical purchase target. */
  quantityGroup?: { id: string; maximumUnits: number };
  /** Country the buying site is in; the funded book places demand here. */
  countryId?: string;
  /** State the buying site is in; a freight order takes local sellers first. */
  stateId?: string;
  /**
   * A lower step of a household demand curve. It buys only when a seller asks
   * that little, so it counts as demand only for what it buys.
   */
  demandStep?: number;
  /**
   * Orders sharing a spend group draw on one budget: together they never spend more than `maximumSpend`, at any mix of fill prices. Every order in a group must carry the same limit.
   */
  spendGroup?: { id: string; maximumSpend: number };
  /**
   * Takes offers from sellers in its own `countryId` before the ordinary book
   * pass (gameConfig.producerPublicHomeFirstStage, public buyers). Absent = the
   * order meets the book only when it comes up in id order.
   */
  homeCountryFirst?: boolean;
  /**
   * Shares each price level of the ordinary pass with the other flagged orders
   * of the same priority on the same book, pro rata to what each still wants
   * (always for producer inputs; gameConfig.producerPublicFairShareStage for
   * public buyers). Absent = the
   * order takes the level whole when it comes up in id order.
   */
  fairShare?: boolean;
}

export interface ProducerTrade {
  id: string;
  kind: "sale" | "internalTransfer";
  offerId: string;
  orderId: string;
  sellerAccountId: string;
  buyerAccountId: string;
  commodity: string;
  book: string;
  units: number;
  unitPrice: number;
  amount: number;
  /** Country of the selling site, when known: the funded book places supply here. */
  sellerCountry?: string;
  /** Country of the buying site, when known. */
  buyerCountry?: string;
}

/** A compact replay of exact pro-rata fills, with every supplier constraint retained. */
export interface ProducerTradeReceipt {
  turn: number;
  offers: readonly ProducerOffer[];
  orders: readonly PurchaseOrder[];
  fills: Array<{
    orderId: string;
    kind: "sale" | "internalTransfer";
    unitPrice: number;
    units: number;
    /** Set when every seller in the fill is in one country; omitted when a fill spans countries. */
    sellerCountry?: string;
    /** Country of the buying site, when known. */
    buyerCountry?: string;
    /** Set when every seller in the fill is in this state (a state-first freight fill). */
    sellerState?: string;
    /** A home-country-first fill: every seller is in the buyer's `countryId`. */
    homeCountry?: true;
    /**
     * Own-sites-first tier of an internal transfer: 0 the buyer's state, 1 the
     * buyer's country outside that state, 2 anywhere else. Absent = all own offers.
     */
    ownTier?: 0 | 1 | 2;
    /** An own-sites-first fill that left out the company's `sellOutsideFirst` offers. */
    skipOutsideFirst?: true;
    /** Exact supplier subset for a route-constrained fair-share leg. */
    supplierOfferIds?: readonly string[];
  }>;
  tradeCount: number;
}

/**
 * One lookup set per eligibility list. Route lists are shared by every order of
 * a (commodity, buyer country), so building a set per order and per clearing
 * repeated the same work millions of times on an embargo turn.
 */
const eligibleSets = new WeakMap<readonly string[], ReadonlySet<string>>();
function eligibleSetOf(order: Pick<PurchaseOrder, "eligibleOfferIds">): ReadonlySet<string> | null {
  const list = order.eligibleOfferIds;
  if (!list) return null;
  let set = eligibleSets.get(list);
  if (!set) {
    set = new Set(list);
    eligibleSets.set(list, set);
  }
  return set;
}

/** Own-sites-first distance tier of a seller for a buyer: state, country, anywhere else. */
export function ownTierOf(
  order: Pick<PurchaseOrder, "stateId" | "countryId">,
  offer: Pick<ProducerOffer, "stateId" | "countryId">
): 0 | 1 | 2 {
  if (order.stateId && offer.stateId === order.stateId) return 0;
  if (order.countryId && offer.countryId === order.countryId) return 1;
  return 2;
}

/** Expand supplier-level trades for audits or route and contract accounting without retaining a matrix. */
export function* producerTrades(receipt: ProducerTradeReceipt): Generator<ProducerTrade> {
  const orders = new Map(receipt.orders.map((order) => [order.id, order]));
  const poolByOffer = new Map<string, ProducerSupplyPool>();
  const pools = new Map<string, ProducerSupplyPool>();
  for (const offer of receipt.offers) {
    const key = JSON.stringify([offer.commodity, offer.book, offer.unitPrice]);
    const pool = pools.get(key) ?? new ProducerSupplyPool();
    pool.add(offer.id, Math.min(offer.units, offer.deliverableUnits ?? offer.units));
    pools.set(key, pool);
    poolByOffer.set(offer.id, pool);
  }
  const remaining = {
    get: (id: string) => poolByOffer.get(id)!.remaining(id),
    set: (id: string, units: number) => poolByOffer.get(id)!.setRemaining(id, units),
  };
  const books = new Map<string, ProducerOffer[]>();
  for (const offer of receipt.offers) {
    const key = bookKey(offer.commodity, offer.book);
    const rows = books.get(key) ?? [];
    rows.push(offer);
    books.set(key, rows);
  }
  // The replay asks for one price level at a time: an ordinary order can only
  // take offers posted at the fill's price, so a book-wide filter every fill
  // is quadratic in offers × fills. Bucket each book by posted price once,
  // preserving the book's (price, id) order inside every bucket.
  const priceBuckets = new Map<string, Map<number, ProducerOffer[]>>();
  for (const [key, rows] of books) {
    rows.sort((a, b) => a.unitPrice - b.unitPrice || compareId(a.id, b.id));
    const byPrice = new Map<number, ProducerOffer[]>();
    for (const offer of rows) {
      const bucket = byPrice.get(offer.unitPrice) ?? [];
      bucket.push(offer);
      byPrice.set(offer.unitPrice, bucket);
    }
    priceBuckets.set(key, byPrice);
  }
  let tradeCount = 0;
  for (const fill of receipt.fills) {
    const order = orders.get(fill.orderId);
    if (!order) throw new Error("Missing producer trade order");
    const eligible = eligibleSetOf(order);
    const suppliers = fill.supplierOfferIds && new Set(fill.supplierOfferIds);
    const internal = fill.kind === "internalTransfer";
    const book = bookKey(order.commodity, order.book);
    const matchesOrder = (offer: ProducerOffer) =>
      (offer.accountId === order.accountId) === internal &&
      (!order.supplierOfferId || offer.id === order.supplierOfferId) &&
      (!suppliers || suppliers.has(offer.id)) &&
      (!eligible || eligible.has(offer.id)) &&
      (!fill.sellerState || offer.stateId === fill.sellerState) &&
      (!fill.homeCountry || offer.countryId === order.countryId) &&
      (fill.ownTier == null || ownTierOf(order, offer) === fill.ownTier) &&
      !(fill.skipOutsideFirst && offer.sellOutsideFirst);
    // Internal transfers and contract/supplier orders ignore the posted price
    // and keep the full-book scan. An ordinary public order takes exactly the
    // offers posted at the fill's price, which the bucket already holds.
    const group =
      !internal && order.supplierOfferId == null && order.contractUnitPrice == null
        ? (priceBuckets.get(book)?.get(fill.unitPrice) ?? []).filter(matchesOrder)
        : (books.get(book) ?? []).filter(
            (offer) =>
              matchesOrder(offer) &&
              (internal || (order.contractUnitPrice ?? offer.unitPrice) === fill.unitPrice)
          );
    // A state-first fill draws on one state's offers individually, never on
    // the shared price pool, so its sellers are replayed one by one.
    const pooled =
      !internal &&
      !fill.sellerState &&
      !fill.homeCountry &&
      !fill.supplierOfferIds &&
      !order.eligibleOfferIds &&
      !order.supplierOfferId &&
      order.contractUnitPrice == null
        ? poolByOffer.get(group[0]?.id)
        : undefined;
    const total = pooled?.total ?? group.reduce((sum, offer) => sum + remaining.get(offer.id)!, 0);
    if (!(total > 0) || fill.units > total + Math.max(1e-8, total * 1e-12))
      throw new Error("Invalid producer trade fill");
    for (const offer of group) {
      const available = remaining.get(offer.id)!;
      const units = Math.min(available, (fill.units / total) * available);
      if (!(units > 0)) continue;
      if (!pooled) remaining.set(offer.id, Math.max(0, available - units));
      tradeCount++;
      yield {
        id: JSON.stringify([receipt.turn, order.id, offer.id]),
        kind: fill.kind,
        offerId: offer.id,
        orderId: order.id,
        sellerAccountId: offer.accountId,
        buyerAccountId: order.accountId,
        commodity: order.commodity,
        book: order.book,
        units,
        unitPrice: fill.unitPrice,
        amount: units * fill.unitPrice,
        sellerCountry: offer.countryId,
        buyerCountry: order.countryId,
      };
    }
    if (pooled) pooled.take(fill.units);
  }
  if (tradeCount !== receipt.tradeCount) throw new Error("Producer trade count mismatch");
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
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

function unique<T extends { id: string }>(rows: readonly T[], label: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error(`Duplicate or empty ${label} id`);
    ids.add(row.id);
  }
}

const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** One pure clearing pass. Seller receipts, buyer charges and observed prices share the same trades. */
export function settleProducerMarket(input: {
  /** Host-owned deadline, checked within a clearing before any persistent writes. */
  checkBudget?: () => void;
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
}): ProducerMarketResult {
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
      input.spilloverUnitsByOrder
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
    tag: { sellerState: string } | { homeCountry: true },
    eligible: ReadonlySet<string> | null = null
  ): { wanted: number; orderBudget: number } => {
    let wanted = openingWanted;
    let orderBudget = openingBudget;
    const quantityGroup = order.quantityGroup && quantityGroups.get(order.quantityGroup.id);
    const key = bookKey(order.commodity, order.book);
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
        book: order.book,
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
  type RoutedPool = {
    stock: ProducerSupplyPool;
    total: number;
    countries: { offer: ProducerOffer; units: number }[];
    internal: Map<string, { offer: ProducerOffer; units: number }[]>;
  };
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
  const clearFairGroup = (group: readonly PurchaseOrder[]): void => {
    const members = group.map((order) => {
      const quantityGroup = order.quantityGroup && quantityGroups.get(order.quantityGroup.id);
      const carriedOrder = carried.get(order.id);
      let wanted = carriedOrder
        ? carriedOrder.wanted
        : Math.min(order.units, quantityGroup?.remaining ?? order.units);
      const ownTake = fillOwnStock(order, wanted);
      wanted = Math.max(0, wanted - ownTake);
      if (quantityGroup && ownTake > 0)
        quantityGroup.remaining = Math.max(0, quantityGroup.remaining - ownTake);
      return {
        order,
        eligible: eligibleSetOf(order),
        quantityGroup,
        wanted,
        orderLimitId: JSON.stringify(["order", order.id]),
        accountLimitId: JSON.stringify(["account", order.accountId]),
        spendLimitId: order.spendGroup && JSON.stringify(["spend", order.spendGroup.id]),
        quantityLimitId:
          order.quantityGroup && JSON.stringify(["quantity", order.quantityGroup.id]),
        orderBudget: carriedOrder
          ? carriedOrder.orderBudget
          : (order.maximumSpend ?? Number.MAX_VALUE),
      };
    });
    type Member = (typeof members)[number];
    const key = bookKey(group[0].commodity, group[0].book);
    const routed = members.some((m) => m.eligible);
    // Reachability depends on route classes, not the number of plants sharing
    // each class. Reuse member cohorts across every supplier and price level.
    const classes = [...new Set(members.map((m) => m.eligible))];
    const classOf = new Map(classes.map((set, i) => [set, i]));
    const cohortMembers = new Map<string, Member[]>();
    const reachability = new Map<string, { key: string; live: Member[] }>();
    const reachable = (supplier: ProducerOffer) => {
      let result = reachability.get(supplier.id);
      if (!result) {
        const indices = classes.flatMap((set, i) => (!set || set.has(supplier.id) ? [i] : []));
        const key = JSON.stringify(indices);
        let live = cohortMembers.get(key);
        if (!live) {
          const allowed = new Set(indices);
          live = members.filter((m) => allowed.has(classOf.get(m.eligible)!));
          cohortMembers.set(key, live);
        }
        result = { key, live };
        reachability.set(supplier.id, result);
      }
      return result;
    };
    for (const [price, pool] of sortedPoolsByBook.get(key) ?? []) {
      input.checkBudget?.();
      // What a member could still buy at this level: target, reservation group,
      // limit price, and the order, account and spend-group budgets.
      const capOf = (m: Member): number => {
        if (!(m.wanted > 0) || price > m.order.maximumUnitPrice) return 0;
        const units = Math.min(m.wanted, m.quantityGroup?.remaining ?? m.wanted);
        const budget = Math.min(
          budgets.get(m.order.accountId)!,
          m.orderBudget,
          groupBudget(m.order)
        );
        return Math.min(units, price > 0 ? budget / price : units);
      };
      // Unrestricted books retain their lazy pooled path. With routes, propose
      // shares at each reachable supplier simultaneously, so the first buyer
      // cannot drain a supplier before another eligible buyer gets its share.
      // Sellers reachable by the same buyers are interchangeable at this price.
      // Group them once rather than retaining an order-by-supplier fill matrix.
      const cohorts = new Map<string, { suppliers: ProducerOffer[]; live: Member[] }>();
      if (routed) {
        for (const supplier of offersByPool.get(pool) ?? []) {
          const { key, live } = reachable(supplier);
          if (live.length === 0) continue;
          const cohort = cohorts.get(key) ?? {
            suppliers: [],
            live,
          };
          cohort.suppliers.push(supplier);
          cohorts.set(key, cohort);
        }
      }
      const levels = routed ? [...cohorts.values()] : [{ suppliers: undefined, live: members }];
      // Within one price/reachability cohort every purchase draws the same
      // pro-rata seller mix. Use the existing lazy stock primitive instead of
      // walking every seller for every buyer. Flush once before another price
      // or group can observe this stock. Country totals share the same mix;
      // same-owner management values retain their individual site legs.
      const routedPools = new Map<readonly ProducerOffer[] | undefined, RoutedPool>();
      for (const { suppliers } of levels) {
        if (!suppliers && !tracked) continue;
        const sellers = suppliers ?? offersByPool.get(pool) ?? [];
        const stock = suppliers ? new ProducerSupplyPool() : pool;
        const countries = new Map<string | undefined, { offer: ProducerOffer; units: number }>();
        const internal = new Map<string, { offer: ProducerOffer; units: number }[]>();
        for (const offer of sellers) {
          const units = remaining.get(offer.id);
          if (suppliers) stock.add(offer.id, units);
          if (tracked) {
            const row = countries.get(offer.countryId) ?? { offer, units: 0 };
            row.units += units;
            countries.set(offer.countryId, row);
          }
          if (tracked && units > 0 && (offer.internalUnitPrice ?? 0) > 0) {
            const owned = internal.get(offer.accountId) ?? [];
            owned.push({ offer, units });
            internal.set(offer.accountId, owned);
          }
        }
        routedPools.set(suppliers, {
          stock,
          total: stock.total,
          countries: [...countries.values()],
          internal,
        });
      }
      const supplyOf = (suppliers: readonly ProducerOffer[] | undefined) =>
        suppliers ? routedPools.get(suppliers)!.stock.total : pool.total;
      for (let round = 0; round <= members.length + cohorts.size; round++) {
        const proposals = levels.flatMap(({ suppliers, live: candidates }) => {
          const supply = supplyOf(suppliers);
          if (!(supply > 0)) return [];
          const live = candidates.filter((m) => capOf(m) > 0);
          const shares = proRataShares(
            supply,
            live.map((m) => ({ weight: m.wanted, cap: capOf(m) }))
          );
          return live.map((m, i) => ({ m, suppliers, units: shares[i] }));
        });
        if (proposals.length === 0) break;
        const shares = capSharedShares(
          proposals.map((p) => p.units),
          proposals.map(({ m }) => [
            { id: m.orderLimitId, units: capOf(m) },
            {
              id: m.accountLimitId,
              units: price > 0 ? budgets.get(m.order.accountId)! / price : Infinity,
            },
            ...(m.order.spendGroup
              ? [
                  {
                    id: m.spendLimitId!,
                    units: price > 0 ? groupBudget(m.order) / price : Infinity,
                  },
                ]
              : []),
            ...(m.order.quantityGroup
              ? [{ id: m.quantityLimitId!, units: m.quantityGroup!.remaining }]
              : []),
          ])
        );
        let short = false;
        let moved = 0;
        proposals.forEach(({ m, suppliers, units }, i) => {
          const supply = supplyOf(suppliers);
          const take = Math.min(shares[i], capOf(m), supply);
          if (take < units - 1e-9 * Math.max(1, units)) short = true;
          if (!(take > 0)) return;
          const amount = buyFromPool(
            m.order,
            price,
            pool,
            take,
            suppliers,
            supply,
            routedPools.get(suppliers)
          );
          moved += take;
          m.wanted = Math.max(0, m.wanted - take);
          if (m.quantityGroup)
            m.quantityGroup.remaining = Math.max(0, m.quantityGroup.remaining - take);
          m.orderBudget = Math.max(0, m.orderBudget - amount);
        });
        if (!short || !(moved > 0)) break;
      }
      for (const [suppliers, lazy] of routedPools) {
        if (!suppliers) continue; // The ordinary pool is flushed once at market close.
        for (const offer of suppliers) {
          const units = lazy.stock.pooledSold(offer.id);
          if (!(units > 0)) continue;
          remaining.set(
            offer.id,
            Math.min(remaining.get(offer.id), lazy.stock.remaining(offer.id))
          );
          const seller = offerResults.get(offer.id)!;
          const amount = units * price;
          seller.soldUnits += units;
          seller.deliveredUnits += units;
          seller.revenue += amount;
          cash.set(offer.accountId, credited(offer.accountId, amount));
        }
      }
    }
  };
  // Phase 2: the ordinary book pass over every order at its residual target.
  const clearOrder = (order: PurchaseOrder): void => {
    input.checkBudget?.();
    const fairGroup = fairGroupOf.get(order.id);
    if (fairGroup) {
      // The whole group clears at its first member's place in the queue.
      if (fairGroup[0] === order) clearFairGroup(fairGroup);
      return;
    }
    const quantityGroup = order.quantityGroup && quantityGroups.get(order.quantityGroup.id);
    const carriedOrder = carried.get(order.id);
    let wanted = carriedOrder
      ? carriedOrder.wanted
      : Math.min(order.units, quantityGroup?.remaining ?? order.units);
    let orderBudget = carriedOrder
      ? carriedOrder.orderBudget
      : (order.maximumSpend ?? Number.MAX_VALUE);
    const eligible = eligibleSetOf(order) ?? null;
    const key = bookKey(order.commodity, order.book);
    if (!eligible && !order.supplierOfferId && order.contractUnitPrice == null) {
      const ownTake = fillOwnStock(order, wanted);
      wanted = Math.max(0, wanted - ownTake);
      if (quantityGroup && ownTake > 0)
        quantityGroup.remaining = Math.max(0, quantityGroup.remaining - ownTake);
      for (const [price, pool] of sortedPoolsByBook.get(key) ?? []) {
        if (!(wanted > 0) || price > order.maximumUnitPrice) break;
        const budget = Math.min(budgets.get(order.accountId)!, orderBudget, groupBudget(order));
        const take = Math.min(wanted, pool.total, price > 0 ? budget / price : wanted);
        if (!(take > 0)) continue;
        const amount = buyFromPool(order, price, pool, take);
        wanted = Math.max(0, wanted - take);
        if (quantityGroup) quantityGroup.remaining = Math.max(0, quantityGroup.remaining - take);
        orderBudget = Math.max(0, orderBudget - amount);
      }
      return;
    }
    const rows = (byBook.get(key) ?? []).filter(
      (offer) =>
        (offer.accountId === order.accountId ||
          (order.contractUnitPrice ?? offer.unitPrice) <= order.maximumUnitPrice) &&
        (!order.supplierOfferId || order.supplierOfferId === offer.id) &&
        (!eligible || eligible.has(offer.id))
    );
    const tiers = new Map<number, ProducerOffer[]>();
    for (const offer of rows) {
      const price =
        offer.accountId === order.accountId ? 0 : (order.contractUnitPrice ?? offer.unitPrice);
      const tier = tiers.get(price) ?? [];
      tier.push(offer);
      tiers.set(price, tier);
    }
    for (const [, tier] of [...tiers].sort(([a], [b]) => a - b)) {
      // At an identical price, using owned stock needs no outside financing.
      // Outside suppliers at that price split the remaining purchase pro rata.
      for (const internal of [true, false]) {
        const group = tier.filter((o) => (o.accountId === order.accountId) === internal);
        const total = group.reduce((n, o) => n + remaining.get(o.id)!, 0);
        const price = order.contractUnitPrice ?? group[0]?.unitPrice ?? 0;
        const budget = Math.min(budgets.get(order.accountId)!, orderBudget, groupBudget(order));
        const take = Math.min(wanted, total, internal || price === 0 ? wanted : budget / price);
        if (!(take > 0) || !(total > 0)) continue;
        fills.push(
          fillsWithCountries(
            order,
            {
              orderId: order.id,
              kind: internal ? "internalTransfer" : "sale",
              unitPrice: internal ? 0 : price,
              units: take,
            },
            group
          )
        );
        for (const offer of group) {
          const available = remaining.get(offer.id)!;
          const units = Math.min(available, (take / total) * available);
          if (!(units > 0)) continue;
          recordDelivery(offer, order, units);
          // Moving owned goods between sites is a physical transfer. It cannot
          // create a sale, an acquisition asset or profit for the corporation.
          const unitPrice = internal ? 0 : price;
          const amount = units * unitPrice;
          if (!Number.isFinite(amount)) throw new Error("Non-finite trade value");
          tradeCount++;
          if (!internal) {
            const key = bookKey(order.commodity, order.book);
            const observed = prices.get(key) ?? {
              commodity: order.commodity,
              book: order.book,
              units: 0,
              value: 0,
              unitPrice: 0,
            };
            observed.units += units;
            observed.value += amount;
            observed.unitPrice = observed.value / observed.units;
            prices.set(key, observed);
          }
          wanted = Math.max(0, wanted - units);
          if (quantityGroup) quantityGroup.remaining = Math.max(0, quantityGroup.remaining - units);
          remaining.set(offer.id, Math.max(0, available - units));
          if (!internal) {
            orderBudget = Math.max(0, orderBudget - amount);
            budgets.set(order.accountId, Math.max(0, budgets.get(order.accountId)! - amount));
            spendFromGroup(order, amount);
            debit(order.accountId, amount);
            cash.set(offer.accountId, credited(offer.accountId, amount));
          }
          const buyer = orderResults.get(order.id)!;
          buyer.deliveredUnits += units;
          buyer.cost += amount;
          const seller = offerResults.get(offer.id)!;
          if (internal) {
            seller.internalDeliveredUnits += units;
            recordInternal(offer, order, units);
          } else seller.soldUnits += units;
          seller.deliveredUnits += units;
          seller.revenue += amount;
        }
      }
      if (!(wanted > 0)) break;
    }
  };
  // Market-first companies buy last, so outside buyers clear their output first.
  // A site that opted to sell outside first defers its company's orders the same way.
  const outsideFirstAccounts = new Set(
    input.ownSitesFirst
      ? input.offers.filter((offer) => offer.sellOutsideFirst).map((offer) => offer.accountId)
      : []
  );
  const deferred: PurchaseOrder[] = [];
  for (const order of orders) {
    if (marketFirst.has(order.accountId) || outsideFirstAccounts.has(order.accountId))
      deferred.push(order);
    else clearOrder(order);
  }
  for (const order of deferred) clearOrder(order);
  for (const offer of input.offers) {
    if (!poolByOffer.get(offer.id)!.hasPooledSales) continue;
    const seller = offerResults.get(offer.id)!;
    const units = poolByOffer.get(offer.id)!.pooledSold(offer.id);
    const amount = units * offer.unitPrice;
    seller.soldUnits += units;
    seller.deliveredUnits += units;
    seller.revenue += amount;
    cash.set(offer.accountId, credited(offer.accountId, amount));
  }
  if (tracked) {
    for (const [key, units] of deliveredAcross) {
      const [seller, buyer, commodity] = JSON.parse(key) as [string, string, string];
      countryBookRow(buyer, commodity).imports += units;
      countryBookRow(seller, commodity).exports += units;
    }
    for (const order of input.orders) {
      if (!(order.demandStep && order.demandStep > 0) || !order.countryId) continue;
      const bought = orderResults.get(order.id)?.deliveredUnits ?? 0;
      if (!(bought > 0)) continue;
      // What a lower step bought was asked for, paid for and received, so it
      // joins demand, requested and funded alike.
      const row = countryBookRow(order.countryId, order.commodity);
      row.demand += bought;
      row.requested = (row.requested ?? 0) + bought;
      row.funded = (row.funded ?? 0) + bought;
    }
  }
  return {
    accounts: [...cash]
      .sort(([a], [b]) => compareId(a, b))
      .map(([id, value]) => ({ id, cash: value })),
    tradeReceipt: {
      turn: input.turn,
      offers: input.offers,
      orders: input.orders,
      fills,
      tradeCount,
    },
    offers: [...offerResults.values()].sort((a, b) => compareId(a.id, b.id)),
    orders: [...orderResults.values()].sort((a, b) => compareId(a.id, b.id)),
    ...(internalDeliveries
      ? {
          internalDeliveries: [...internalDeliveries.values()].sort(
            (a, b) => compareId(a.offerId, b.offerId) || compareId(a.orderId, b.orderId)
          ),
        }
      : {}),
    prices: [...prices.values()].sort((a, b) =>
      compareId(bookKey(a.commodity, a.book), bookKey(b.commodity, b.book))
    ),
    ...(tracked
      ? {
          countryBooks: sortFundedCountryBookRows(
            filledByCountry(input.orders, orderResults, countryBookRow, countryBookRows)
          ),
        }
      : {}),
  };
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
  spilloverUnits?: ReadonlyMap<string, number>
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

export type ProducerQuotePolicy =
  | { kind: "manual"; unitPrice: number }
  | { kind: "costPlus"; markup: number }
  | { kind: "automatic"; targetMarkup: number };

/** Price levels let every candidate use cumulative volumes instead of rescanning the book. */
function priceVolumes(rows: readonly { price: number; units: number }[]) {
  const levels = new Map<number, number>();
  for (const row of rows) {
    const price = nonNegative(row.price, "price level");
    levels.set(
      price,
      nonNegative((levels.get(price) ?? 0) + nonNegative(row.units, "level units"), "level volume")
    );
  }
  const prices = [...levels.keys()].sort((a, b) => a - b);
  const before = Array<number>(prices.length + 1).fill(0);
  const after = Array<number>(prices.length + 1).fill(0);
  for (let i = 0; i < prices.length; i++)
    before[i + 1] = nonNegative(before[i] + levels.get(prices[i])!, "cumulative volume");
  for (let i = prices.length - 1; i >= 0; i--)
    after[i] = nonNegative(after[i + 1] + levels.get(prices[i])!, "cumulative volume");
  return {
    prices,
    at: (price: number) => {
      let low = 0,
        high = prices.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (prices[mid] < price) low = mid + 1;
        else high = mid;
      }
      return { cheaper: before[low], tied: levels.get(price) ?? 0, atOrAbove: after[low] };
    },
  };
}

/** Quote policy selects an asking price only; all policies settle identically. */
/** Share of the best expected profit a buyer tie-break may give up for more reachable demand. */
export const ASK_BUYER_TIE_PROFIT_SHARE = 0.01;

export function quoteProducer(input: {
  policy: ProducerQuotePolicy;
  referenceUnitPrice: number;
  /**
   * What buyers actually paid for this commodity in this book last turn. An
   * automatic ask anchors here; absent (no trade) it falls back to the reference.
   */
  clearingUnitPrice?: number;
  /** This output sold nothing last turn: an automatic ask drops its markup. */
  soldNothingLastTurn?: boolean;
  variableUnitCost: number;
  fixedCost: number;
  offeredUnits: number;
  /**
   * Sell-through memory for an automatic ask (see autoAskRules). When present,
   * the controller owns the price instead of the profit-maximum candidate
   * search, which is how a seller that sold its whole offer can ask for more
   * and how a raise the book rejected is given back. Absent keeps the
   * historical estimator, which cannot raise a price at all.
   */
  autoAsk?: {
    memory: { ask: number; previousAsk: number } | null;
    /** Units the last ask actually sold. */
    soldUnits: number;
    /** Units the last ask offered. */
    offeredUnits: number;
    /** Fractional raise per sell-out step; defaults inside the controller. */
    step?: number;
  };
  demand: readonly { maximumUnitPrice: number; units: number }[];
  competitors: readonly { unitPrice: number; units: number }[];
  /**
   * Buyer tie-break (gameConfig.producerAskBuyerTieStage). Among candidate
   * asks whose expected profit is within ASK_BUYER_TIE_PROFIT_SHARE of the
   * best, take the one the most demand can pay. Absent = off.
   */
  buyerTieBreak?: boolean;
  /**
   * Competitors match (producerAskBuyerTieStage >= 2). The estimate treats every
   * competitor quoted at or above a candidate as matching it, instead of holding
   * its opening quote. Absent = off.
   */
  competitorsMatch?: boolean;
}): {
  unitPrice: number;
  breakEvenUnitPrice: number | null;
  expectedSoldUnits: number;
  expectedProfit: number;
} {
  const reference = nonNegative(input.referenceUnitPrice, "reference price");
  const variable = nonNegative(input.variableUnitCost, "variable unit cost");
  const fixed = nonNegative(input.fixedCost, "fixed cost");
  const units = nonNegative(input.offeredUnits, "offered units");
  const breakEven = units > 0 ? variable + fixed / units : null;
  const demandVolumes = priceVolumes(
    input.demand.map((o) => ({ price: o.maximumUnitPrice, units: o.units }))
  );
  const supplyVolumes = priceVolumes(
    input.competitors.map((o) => ({ price: o.unitPrice, units: o.units }))
  );
  const estimate = (price: number) => {
    const demand = demandVolumes.at(price).atOrAbove;
    const supply = supplyVolumes.at(price);
    const cheaper = supply.cheaper;
    // Opening quotes in a short lane sit at the shortage step, above the household
    // ceiling, so each seller read the business bids above that ceiling as its own.
    // On turn 708 every US food plant asked 913.12 against household ceilings of
    // 889.94 and 13k units went unsold. Sellers quoted above a price can match it.
    const tied = units + (input.competitorsMatch ? supply.atOrAbove : supply.tied);
    const sold = tied > 0 ? Math.min(units, (Math.max(0, demand - cheaper) * units) / tied) : 0;
    return {
      unitPrice: price,
      breakEvenUnitPrice: breakEven,
      expectedSoldUnits: sold,
      expectedProfit: sold * price - variable * units - fixed,
    };
  };
  if (input.policy.kind === "manual")
    return estimate(nonNegative(input.policy.unitPrice, "manual price"));
  const markup = input.policy.kind === "costPlus" ? input.policy.markup : input.policy.targetMarkup;
  if (!Number.isFinite(markup) || markup < -1) throw new Error("Invalid target markup");
  if (input.policy.kind === "costPlus") return estimate((breakEven ?? reference) * (1 + markup));
  // An automatic seller prices off the market, never above what buyers paid last
  // turn plus its markup. The estimate treats every bid as reachable, so a
  // far-away ceiling in a short book looked like the best ask. The reference
  // price alone can sit above the clearing. A plant whose costs exceed the
  // market sells at the market and takes the loss.
  const clearing = input.clearingUnitPrice;
  const anchor =
    clearing != null && Number.isFinite(clearing) && clearing > 0 ? clearing : reference;
  // A seller that sold nothing last turn asks no more than the clearing, so an ask
  // stuck above the book steps down instead of repeating.
  const ceiling = anchor * (input.soldNothingLastTurn ? Math.min(1, 1 + markup) : 1 + markup);
  // Sell-through feedback (autoAskRules). With ask memory the controller decides
  // the price: sold out climbs one step, the deadband holds, a shortfall reverts
  // to the previous ask or steps down. Without memory the estimator below still
  // runs. The controller replaces the profit search, so the demand book only
  // bounds the price through the ceiling and the ask moves one step per turn.
  // The loop closes where the caller stores `rememberAutoAsk(memory, decision)`
  // for next turn; nothing stores it yet, so no caller passes `autoAsk`. Note
  // that production.ts applies `markedDownAsk` after this returns, so the posted
  // price can sit below the one chosen here.
  if (input.autoAsk) {
    // Last turn's clearing includes this plant's own sales, so where it sets the
    // price a sell-out raise lifts the clearing and the ceiling with it, and the
    // step cap never binds. Bound the controller by the reference price too.
    const controllerCeiling = reference > 0 ? Math.min(ceiling, reference * (1 + markup)) : ceiling;
    const decided = nextAutoAsk({
      memory: input.autoAsk.memory,
      soldUnits: input.autoAsk.soldUnits,
      offeredUnits: input.autoAsk.offeredUnits,
      ...(input.autoAsk.step != null ? { step: input.autoAsk.step } : {}),
      ceiling: controllerCeiling,
    });
    // The controller reads a non-positive ceiling as unbounded, but here a zero
    // ceiling (no anchor price, or a -100% markup) is a real cap of zero.
    if (decided) return estimate(Math.min(decided.ask, controllerCeiling));
  }
  const candidates = new Set([reference, anchor, ceiling]);
  for (const seller of input.competitors)
    candidates.add(nonNegative(seller.unitPrice, "competitor price"));
  for (const order of input.demand)
    candidates.add(nonNegative(order.maximumUnitPrice, "demand limit"));
  const scored = [...candidates]
    .filter((price) => price <= ceiling)
    .map(estimate)
    .sort((a, b) => b.expectedProfit - a.expectedProfit || a.unitPrice - b.unitPrice);
  const best = scored[0];
  if (!input.buyerTieBreak || !best) return best;
  // The estimate assumes every competitor holds its opening quote, so a ceiling a
  // hair above a large buyer block looks as good as the block itself. Every seller
  // in the lane then posts it and the block buys nothing: on turn 700 US food sat
  // at 884.36 against household ceilings of 884.26 and 17k units went unsold. A
  // near-equal profit is not worth losing the buyers below it.
  const slack = Math.abs(best.expectedProfit) * ASK_BUYER_TIE_PROFIT_SHARE;
  const reach = (price: number) => demandVolumes.at(price).atOrAbove;
  return scored
    .filter((e) => e.expectedProfit >= best.expectedProfit - slack)
    .sort(
      (a, b) =>
        reach(b.unitPrice) - reach(a.unitPrice) ||
        b.expectedProfit - a.expectedProfit ||
        a.unitPrice - b.unitPrice
    )[0];
}
