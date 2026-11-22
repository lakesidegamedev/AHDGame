import type { GridDelivery } from "@/lib/electricityNetwork/rules/types";
import { ProducerSupplyPool } from "@/lib/market/producerMarket/supplyPoolRules";
import { bookKey } from "@/lib/market/producerMarket/bookKey";

import { nextAutoAsk } from "@/lib/market/producerMarket/autoAskRules";

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
   * (always for producer inputs and households; gameConfig.producerPublicFairShareStage for
   * public buyers). Absent = the
   * order takes the level whole when it comes up in id order.
   */
  fairShare?: boolean;
  /**
   * Books of neighbouring states whose leftover supply this order may buy once
   * every order has cleared its own book (one hop, same country). Absent = the
   * order meets only its own book.
   */
  spillBooks?: readonly string[];
}

export interface ProducerTrade {
  dispatchedUnits?: number;
  gridPath?: readonly string[];
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
    grid?: GridDelivery;
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
    /** A neighbour-spill fill: every seller is in this other book, not the order's own. */
    spillBook?: string;
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

export /**
 * One lookup set per eligibility list. Route lists are shared by every order of
 * a (commodity, buyer country), so building a set per order and per clearing
 * repeated the same work millions of times on an embargo turn.
 */
const eligibleSets = new WeakMap<readonly string[], ReadonlySet<string>>();

export function eligibleSetOf(
  order: Pick<PurchaseOrder, "eligibleOfferIds">
): ReadonlySet<string> | null {
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
export function* producerTrades(
  receipt: ProducerTradeReceipt,
  accountId?: string
): Generator<ProducerTrade> {
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
  const offersById = new Map(receipt.offers.map((o) => [o.id, o]));
  let fillIndex = 0;
  for (const fill of receipt.fills) {
    const index = fillIndex++;
    if (fill.grid) {
      const offer = offersById.get(fill.grid.offerId),
        order = orders.get(fill.orderId);
      if (
        !offer ||
        !order ||
        offer.commodity !== "energy" ||
        order.commodity !== "energy" ||
        !Number.isFinite(fill.units) ||
        fill.units < 0 ||
        !Number.isFinite(fill.grid.dispatchedUnits) ||
        fill.grid.dispatchedUnits < fill.units - 1e-9 ||
        !Number.isFinite(fill.unitPrice) ||
        fill.unitPrice < 0 ||
        !Number.isFinite(fill.units * fill.unitPrice) ||
        bookKey(order.commodity, order.book) !== bookKey(offer.commodity, offer.book) ||
        (fill.kind === "internalTransfer") !== (order.accountId === offer.accountId) ||
        (fill.kind === "internalTransfer" && fill.unitPrice !== 0) ||
        (order.supplierOfferId != null && order.supplierOfferId !== offer.id) ||
        (eligibleSetOf(order) != null && !eligibleSetOf(order)!.has(offer.id))
      )
        throw Error("Invalid electricity receipt");
      const available = remaining.get(offer.id)!;
      if (fill.grid.dispatchedUnits > available + Math.max(1e-8, available * 1e-10))
        throw Error("Electricity receipt exceeds supply");
      remaining.set(offer.id, Math.max(0, available - fill.grid.dispatchedUnits));
      if (!accountId || order.accountId === accountId || offer.accountId === accountId)
        yield {
          id: JSON.stringify([receipt.turn, order.id, offer.id, "grid", index]),
          kind: fill.kind,
          offerId: offer.id,
          orderId: order.id,
          sellerAccountId: offer.accountId,
          buyerAccountId: order.accountId,
          commodity: order.commodity,
          book: order.book,
          units: fill.units,
          unitPrice: fill.unitPrice,
          amount: fill.units * fill.unitPrice,
          sellerCountry: offer.countryId,
          buyerCountry: order.countryId,
          dispatchedUnits: fill.grid.dispatchedUnits,
          gridPath: fill.grid.path,
        };
      continue;
    }
    const order = orders.get(fill.orderId);
    if (!order) throw new Error("Missing producer trade order");
    const eligible = eligibleSetOf(order);
    const suppliers = fill.supplierOfferIds && new Set(fill.supplierOfferIds);
    const internal = fill.kind === "internalTransfer";
    const book = bookKey(order.commodity, fill.spillBook ?? order.book);
    const matchesOrder = (offer: ProducerOffer) =>
      (offer.accountId === order.accountId) === internal &&
      (!order.supplierOfferId || offer.id === order.supplierOfferId) &&
      (!suppliers || suppliers.has(offer.id)) &&
      (!eligible || eligible.has(offer.id)) &&
      (!fill.sellerState || offer.stateId === fill.sellerState) &&
      (!fill.homeCountry || offer.countryId === order.countryId) &&
      (!fill.spillBook || offer.countryId === order.countryId) &&
      (fill.ownTier == null || ownTierOf(order, offer) === fill.ownTier) &&
      !(fill.skipOutsideFirst && offer.sellOutsideFirst);
    // Internal transfers and contract/supplier orders ignore the posted price
    // and keep the full-book scan. An ordinary public order takes exactly the
    // offers posted at the fill's price, which the bucket already holds.
    const group =
      !internal &&
      !fill.spillBook &&
      order.supplierOfferId == null &&
      order.contractUnitPrice == null
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
      !fill.spillBook &&
      !fill.supplierOfferIds &&
      !order.eligibleOfferIds &&
      !order.supplierOfferId &&
      order.contractUnitPrice == null
        ? poolByOffer.get(group[0]?.id)
        : undefined;
    const total = pooled?.total ?? group.reduce((sum, offer) => sum + remaining.get(offer.id)!, 0);
    // A replay group can drift from the clearing pass by rounding dust; share what it holds.
    if (!(total > 0)) continue;
    const fillUnits = Math.min(fill.units, total);
    const visible =
      pooled && accountId && order.accountId !== accountId
        ? group.filter((offer) => offer.accountId === accountId)
        : group;
    for (const offer of visible) {
      const available = remaining.get(offer.id)!;
      const units = Math.min(available, (fillUnits / total) * available);
      if (!(units > 0)) continue;
      if (!pooled) remaining.set(offer.id, Math.max(0, available - units));
      if (accountId && order.accountId !== accountId && offer.accountId !== accountId) continue;
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
    if (pooled) pooled.take(fillUnits);
  }
}

export function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

export const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type ProducerQuotePolicy =
  | { kind: "manual"; unitPrice: number }
  | { kind: "costPlus"; markup: number }
  | { kind: "automatic"; targetMarkup: number };

export /** Price levels let every candidate use cumulative volumes instead of rescanning the book. */
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
  /**
   * The slow market price a non-zero posture is measured from
   * (postureAnchorRules). Absent falls back to the clearing price.
   */
  postureAnchorUnitPrice?: number;
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
  const market =
    clearing != null && Number.isFinite(clearing) && clearing > 0 ? clearing : reference;
  // A chosen posture is measured from the slow anchor, not last turn's clearing:
  // a discount measured from a clearing it set itself compounds every turn
  // (ticket 1880: US electronics 586, 494, then a 395 ask). Automatic sellers
  // (no markup) still ask the market.
  const postureAnchor = input.postureAnchorUnitPrice;
  const anchor =
    markup !== 0 && postureAnchor != null && Number.isFinite(postureAnchor) && postureAnchor > 0
      ? postureAnchor
      : market;
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
