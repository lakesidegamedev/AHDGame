/**
 * The wider economy: a background buyer and seller in every plant-country
 * state. Sized once from a market baseline (a share of each good's demand),
 * split by real GDP share and grown only with real GDP. It trades only after
 * the market has cleared: the buyer takes output no real buyer bought, the
 * seller fills orders no plant could fill (withWideEconomyFallback).
 *
 * Pure: market baseline, states, prices and book mapping in, orders out.
 */
import type { ProducerOffer, PurchaseOrder } from "./producerQuotes";
import type { ProducerMarketResult } from "./rules";
import type { WideEconomySale } from "./productionTypes";
import { sortFundedCountryBookRows } from "./fundedBookRules";

/** The background economy's size: this share of each good's baseline demand. */
export const WIDE_ECONOMY_DEMAND_SHARE = 0.1;

/** The background buyer is this much larger than the background seller. */
export const WIDE_ECONOMY_SUPPLY_HEADROOM = 1.1;

/** The background seller asks this multiple of the reference price, so plants sell first. */
export const WIDE_ECONOMY_SELLER_MARKUP = 1.05;

/** Goods the wider economy never trades: military goods are bought by governments only. */
export const WIDE_ECONOMY_EXCLUDED = new Set(["ordnance"]);

/** Settled turns averaged into the baseline. */
export const WIDE_ECONOMY_BASELINE_TURNS = 3;

export interface WideEconomyState {
  stateId: string;
  countryId: string;
  /** Annual state GDP deflated by its country's price index, in local currency. */
  realGdp: number;
  /** The same real GDP in the anchor currency, so states of different countries compare. */
  anchorGdp?: number;
}

/** One settled turn's world supply and demand of a good, in settlement units per turn. */
export interface WideEconomyMarketRow {
  commodity: string;
  supply: number;
  demand: number;
}

export interface WideEconomyBaseline {
  /** Units per turn the background seller offers of each good at baseline real GDP. */
  units: Record<string, number>;
  /** Baseline real GDP of each plant-country state, in its own currency. */
  realGdp: Record<string, number>;
  /** Country of each baseline state. */
  countryOfState: Record<string, string>;
  /**
   * Each state's share of the baseline, from real GDP in the anchor currency.
   * A baseline without it split by local-currency GDP, which gave countries
   * with many units to the anchor almost everything (wideEconomyWeights).
   */
  weight?: Record<string, number>;
}

/** Each state's share of the baseline: its real GDP in the anchor currency over the total. */
export function wideEconomyWeights(
  realGdp: Readonly<Record<string, number>>,
  countryOfState: Readonly<Record<string, string>>,
  localPerAnchor: (countryId: string) => number | null | undefined
): Record<string, number> {
  const anchor: [string, number][] = [];
  for (const stateId of Object.keys(realGdp).sort()) {
    const rate = localPerAnchor(countryOfState[stateId] ?? "");
    const gdp = finitePositive(realGdp[stateId]!);
    if (rate == null || !(finitePositive(rate) > 0) || !(gdp > 0)) continue;
    anchor.push([stateId, gdp / rate]);
  }
  const total = anchor.reduce((sum, [, v]) => sum + v, 0);
  return total > 0 ? Object.fromEntries(anchor.map(([id, v]) => [id, v / total])) : {};
}

const finitePositive = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * The baseline from recent settled turns: a share of everything ordered per
 * good, summed per turn, then averaged over the turns.
 */
export function wideEconomyBaseline(input: {
  turns: readonly (readonly WideEconomyMarketRow[])[];
  states: readonly WideEconomyState[];
}): WideEconomyBaseline {
  const turns = input.turns.filter((rows) => rows.length > 0);
  const demand = new Map<string, number>();
  for (const rows of turns)
    for (const r of rows)
      demand.set(r.commodity, (demand.get(r.commodity) ?? 0) + finitePositive(r.demand));
  const units: Record<string, number> = {};
  if (turns.length > 0)
    for (const commodity of [...demand.keys()].sort()) {
      if (WIDE_ECONOMY_EXCLUDED.has(commodity)) continue;
      const d = demand.get(commodity)! / turns.length;
      if (d > 0) units[commodity] = WIDE_ECONOMY_DEMAND_SHARE * d;
    }
  const realGdp: Record<string, number> = {};
  const countryOfState: Record<string, string> = {};
  const anchorGdp: Record<string, number> = {};
  for (const s of [...input.states].sort((a, b) => (a.stateId < b.stateId ? -1 : 1))) {
    const gdp = finitePositive(s.realGdp);
    if (!(gdp > 0) || !s.countryId) continue;
    realGdp[s.stateId] = gdp;
    countryOfState[s.stateId] = s.countryId;
    const anchor = finitePositive(s.anchorGdp ?? 0);
    if (anchor > 0) anchorGdp[s.stateId] = anchor;
  }
  const anchorTotal = Object.values(anchorGdp).reduce((sum, v) => sum + v, 0);
  // Shares need one currency; without anchor GDP for every state, split as before.
  const weight =
    anchorTotal > 0 && Object.keys(anchorGdp).length === Object.keys(realGdp).length
      ? Object.fromEntries(Object.entries(anchorGdp).map(([id, v]) => [id, v / anchorTotal]))
      : undefined;
  return { units, realGdp, countryOfState, ...(weight ? { weight } : {}) };
}

export function wideEconomyOrderId(countryId: string, commodity: string, book: string): string {
  return JSON.stringify(["wide", countryId, commodity, book]);
}

export function wideEconomyOfferId(countryId: string, commodity: string, book: string): string {
  return JSON.stringify(["wide", "offer", countryId, commodity, book]);
}

interface WideEconomyLine {
  countryId: string;
  commodity: string;
  book: string;
  units: number;
  price: number;
}

interface WideEconomyLineInput {
  baseline: WideEconomyBaseline;
  /** Current real GDP per state; states not in the baseline are ignored. */
  realGdpNow: ReadonlyMap<string, number>;
  /** Reference price of a good; the state id is empty for a world-book good. */
  referencePrice: (commodity: string, stateId: string) => number | null;
  isStateScoped: (commodity: string) => boolean;
  mapBook: (book: string, commodity: string, countryId: string) => string;
}

/**
 * A state's share of a good is the baseline units times its baseline weight
 * (its share of real GDP in the anchor currency), grown by its own real GDP
 * in its own currency since the baseline, so exchange rates never read as
 * growth. State-scoped goods
 * trade on the state's book (then `mapBook`, as public orders do); every other
 * good trades once per country on the world book. A shared book takes the
 * lowest of its states' prices.
 */
function wideEconomyLines(input: WideEconomyLineInput): WideEconomyLine[] {
  const states = Object.keys(input.baseline.realGdp).sort();
  const totalGdp0 = states.reduce((sum, id) => sum + input.baseline.realGdp[id]!, 0);
  if (!(totalGdp0 > 0)) return [];
  const byKey = new Map<string, WideEconomyLine>();
  const add = (line: WideEconomyLine) => {
    const key = JSON.stringify([line.countryId, line.commodity, line.book]);
    const same = byKey.get(key);
    if (!same) return void byKey.set(key, { ...line });
    same.units += line.units;
    same.price = Math.min(same.price, line.price);
  };
  for (const commodity of Object.keys(input.baseline.units).sort()) {
    if (WIDE_ECONOMY_EXCLUDED.has(commodity)) continue;
    const units0 = finitePositive(input.baseline.units[commodity]!);
    if (!(units0 > 0)) continue;
    const scoped = input.isStateScoped(commodity);
    const worldUnits = new Map<string, number>();
    for (const stateId of states) {
      const now = finitePositive(input.realGdpNow.get(stateId) ?? 0);
      const weight = input.baseline.weight;
      const units = weight
        ? (units0 * finitePositive(weight[stateId] ?? 0) * now) / input.baseline.realGdp[stateId]!
        : (units0 * now) / totalGdp0;
      if (!(units > 0)) continue;
      const countryId = input.baseline.countryOfState[stateId]!;
      if (!scoped) {
        worldUnits.set(countryId, (worldUnits.get(countryId) ?? 0) + units);
        continue;
      }
      const price = input.referencePrice(commodity, stateId);
      if (price == null || !(finitePositive(price) > 0)) continue;
      add({
        countryId,
        commodity,
        book: input.mapBook(`state:${stateId}`, commodity, countryId),
        units,
        price,
      });
    }
    if (scoped) continue;
    const price = input.referencePrice(commodity, "");
    if (price == null || !(finitePositive(price) > 0)) continue;
    for (const [countryId, units] of [...worldUnits].sort(([a], [b]) => (a < b ? -1 : 1)))
      add({ countryId, commodity, book: "world", units, price });
  }
  return [...byKey.values()];
}

/** This turn's background buyer: 1.1x the seller, bidding the reference price at most. */
export function wideEconomyOrders(
  input: WideEconomyLineInput & { accountId: (countryId: string) => string }
): PurchaseOrder[] {
  return wideEconomyLines(input).map((line) => {
    const units = line.units * WIDE_ECONOMY_SUPPLY_HEADROOM;
    return {
      id: wideEconomyOrderId(line.countryId, line.commodity, line.book),
      accountId: input.accountId(line.countryId),
      commodity: line.commodity,
      book: line.book,
      units,
      maximumUnitPrice: line.price,
      maximumSpend: units * line.price,
      countryId: line.countryId,
      // Counted as demand only for what it buys (see productionOrderOutcomes).
      demandStep: 1,
    };
  });
}

/** This turn's background seller, asking a little above the reference price. */
export function wideEconomyOffers(
  input: WideEconomyLineInput & { accountId: (countryId: string) => string }
): ProducerOffer[] {
  return wideEconomyLines(input).map((line) => ({
    id: wideEconomyOfferId(line.countryId, line.commodity, line.book),
    accountId: input.accountId(line.countryId),
    commodity: line.commodity,
    book: line.book,
    units: line.units,
    unitPrice: line.price * WIDE_ECONOMY_SELLER_MARKUP,
    countryId: line.countryId,
  }));
}

/**
 * The extra seller units a persistently short lane gets on top of its base
 * line (wideEconomyShortageBoost), as separate offers at the same ask. Only
 * final buyers and background countries' imports may fall back on them, never
 * a plant's inputs, so plants keep planning on the base share alone and the
 * extra never reshapes real production.
 */
export function wideEconomyBoostOffers(
  base: readonly ProducerOffer[],
  boostByLane: ReadonlyMap<string, number>,
  laneKey: (commodity: string, book: string) => string
): ProducerOffer[] {
  return base.flatMap((o) => {
    const factor = boostByLane.get(laneKey(o.commodity, o.book)) ?? 1;
    const extra = o.units * (factor - 1);
    return extra > 0
      ? [{ ...o, id: JSON.stringify([...JSON.parse(o.id), "boost"]), units: extra }]
      : [];
  });
}

/** Book the wider economy's seller offers on, apart from the real market. */
export function wideEconomyFillBook(book: string): string {
  return `wide:${book}`;
}

/**
 * The seller's offers for this turn, moved onto their own book so no real
 * buyer meets them in the ordinary passes. Goods in `skip` are left out.
 */
export function wideEconomyFallbackOffers(
  lines: readonly ProducerOffer[],
  skip: (commodity: string) => boolean = () => false
): ProducerOffer[] {
  return lines
    .filter((o) => !skip(o.commodity) && !!o.countryId && finitePositive(o.units) > 0)
    .map((o) => ({ ...o, book: wideEconomyFillBook(o.book) }));
}

/**
 * Real orders with the wider economy's seller as their last resort. An order
 * may fall back on its own country's seller for its own lane, when it bids at
 * least the seller's ask. A background country's import order (`exportTo`)
 * may fall back on any plant country's seller on its world lane, after home
 * buyers (settleProducerOrders). Named-supplier and contract orders keep their
 * supplier, and the wider economy never buys from itself.
 */
export function withWideEconomyFallback(
  orders: readonly PurchaseOrder[],
  offers: readonly ProducerOffer[],
  laneKey: (commodity: string, book: string) => string,
  exportTo: ReadonlySet<string> = new Set()
): PurchaseOrder[] {
  if (offers.length === 0) return [...orders];
  const prefix = wideEconomyFillBook("");
  const byLane = new Map<string, ProducerOffer[]>();
  const worldByLane = new Map<string, ProducerOffer[]>();
  const sellers = new Set<string>();
  for (const offer of offers) {
    sellers.add(offer.accountId);
    const book = offer.book.slice(prefix.length);
    const lane = laneKey(offer.commodity, book);
    const key = JSON.stringify([lane, offer.countryId]);
    byLane.set(key, [...(byLane.get(key) ?? []), offer]);
    if (book === "world") worldByLane.set(lane, [...(worldByLane.get(lane) ?? []), offer]);
  }
  return orders.map((o) => {
    if (!o.countryId || o.afterMarket || sellers.has(o.accountId)) return o;
    if (o.supplierOfferId || o.contractUnitPrice != null) return o;
    const lane = laneKey(o.commodity, o.book);
    if (exportTo.has(o.accountId)) {
      const ids = (worldByLane.get(lane) ?? [])
        .filter((offer) => offer.countryId !== o.countryId && o.maximumUnitPrice >= offer.unitPrice)
        .map((offer) => offer.id);
      return ids.length > 0 ? { ...o, fallbackOfferIds: ids } : o;
    }
    const ids = (byLane.get(JSON.stringify([lane, o.countryId])) ?? [])
      .filter((offer) => o.maximumUnitPrice >= offer.unitPrice)
      .map((offer) => offer.id);
    return ids.length > 0 ? { ...o, fallbackOfferIds: ids } : o;
  });
}

/** A lane is short when its real unmet share is above this... */
export const WIDE_ECONOMY_SHORT_THRESHOLD = 0.15;
/** ...in each of this many recent settled turns. */
export const WIDE_ECONOMY_SHORT_TURNS = 3;
/** A short lane's seller grows to leave about this share of demand unmet... */
export const WIDE_ECONOMY_TARGET_SHORTAGE = 0.1;
/** ...but never beyond this share of demand. */
export const WIDE_ECONOMY_MAX_SHARE = 0.4;

/**
 * Each lane's real unmet share for one settled turn: what real buyers ordered
 * and did not get from real sellers, over what they ordered. What the wider
 * economy's seller filled counts as unmet here, so a lane it props up still
 * reads as short until real supply grows. The wider economy's own buyer is
 * not a real buyer.
 */
export function wideEconomyLaneShortage(input: {
  outcomes: readonly {
    accountId: string;
    commodity: string;
    book: string;
    requestedUnits: number;
    deliveredUnits: number;
  }[];
  orders: readonly Pick<PurchaseOrder, "id" | "commodity" | "book">[];
  fills: readonly { orderId: string; units: number; spillBook?: string }[];
  isWideAccount: (accountId: string) => boolean;
  laneKey: (commodity: string, book: string) => string;
}): Record<string, number> {
  const prefix = wideEconomyFillBook("");
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  const seeded = new Map<string, number>();
  for (const f of input.fills) {
    if (!f.spillBook?.startsWith(prefix)) continue;
    const o = orderById.get(f.orderId);
    if (!o) continue;
    const lane = input.laneKey(o.commodity, o.book);
    seeded.set(lane, (seeded.get(lane) ?? 0) + finitePositive(f.units));
  }
  const asked = new Map<string, number>();
  const got = new Map<string, number>();
  for (const o of input.outcomes) {
    if (input.isWideAccount(o.accountId)) continue;
    const lane = input.laneKey(o.commodity, o.book);
    asked.set(lane, (asked.get(lane) ?? 0) + finitePositive(o.requestedUnits));
    got.set(lane, (got.get(lane) ?? 0) + finitePositive(o.deliveredUnits));
  }
  const out: Record<string, number> = {};
  for (const lane of [...asked.keys()].sort()) {
    const a = asked.get(lane)!;
    if (!(a > 0)) continue;
    const real = Math.max(0, (got.get(lane) ?? 0) - (seeded.get(lane) ?? 0));
    out[lane] = Math.min(1, Math.max(0, (a - real) / a));
  }
  return out;
}

/**
 * How much bigger each persistently short lane's seller is than the base
 * share. A lane short by more than the threshold in each of the recent turns
 * gets a seller of its smallest recent shortage less the target, between the
 * base share and the cap; any other lane stays at the base share. It shrinks
 * by itself as real supply grows.
 */
export function wideEconomyShortageBoost(
  history: readonly Readonly<Record<string, number>>[]
): Map<string, number> {
  const boost = new Map<string, number>();
  if (history.length < WIDE_ECONOMY_SHORT_TURNS) return boost;
  const recent = history.slice(0, WIDE_ECONOMY_SHORT_TURNS);
  for (const lane of Object.keys(recent[0]!).sort()) {
    const shortages = recent.map((turn) => turn[lane]);
    if (shortages.some((u) => u == null || !(u > WIDE_ECONOMY_SHORT_THRESHOLD))) continue;
    const u = Math.min(...(shortages as number[]));
    const share = Math.min(
      WIDE_ECONOMY_MAX_SHARE,
      Math.max(WIDE_ECONOMY_DEMAND_SHARE, u - WIDE_ECONOMY_TARGET_SHORTAGE)
    );
    if (share > WIDE_ECONOMY_DEMAND_SHARE) boost.set(lane, share / WIDE_ECONOMY_DEMAND_SHARE);
  }
  return boost;
}

/** A lane is oversupplied when this share of its new plant output goes unsold... */
export const WIDE_ECONOMY_SURPLUS_THRESHOLD = 0.15;
/** ...in each of this many recent settled turns. */
export const WIDE_ECONOMY_SURPLUS_TURNS = 3;
/** An oversupplied lane's buyer grows to leave about this share of new output unsold... */
export const WIDE_ECONOMY_TARGET_SURPLUS = 0.1;
/** ...but never beyond this share of demand (2.5x the base buyer). */
export const WIDE_ECONOMY_MAX_BUYER_SHARE = 0.25;

/**
 * Each lane's unsold share of new plant output for one settled turn: what
 * plants made this turn and neither real buyers nor the company's own sites
 * took, over what they made. Sales count against new output first, so stock
 * carried from earlier turns never makes a lane read as oversupplied. What the wider economy's own buyer
 * bought counts as unsold here, so a lane it props up still reads as
 * oversupplied until real demand grows.
 */
export function wideEconomyLaneSurplus(input: {
  products: readonly {
    commodity: string;
    book: string;
    producedUnits?: number;
    soldUnits?: number;
    internalDeliveredUnits?: number;
  }[];
  outcomes: readonly {
    accountId: string;
    commodity: string;
    book: string;
    deliveredUnits: number;
  }[];
  isWideAccount: (accountId: string) => boolean;
  laneKey: (commodity: string, book: string) => string;
}): Record<string, number> {
  const made = new Map<string, number>();
  const sold = new Map<string, number>();
  for (const p of input.products) {
    const lane = input.laneKey(p.commodity, p.book);
    made.set(lane, (made.get(lane) ?? 0) + finitePositive(p.producedUnits ?? 0));
    sold.set(
      lane,
      (sold.get(lane) ?? 0) +
        finitePositive(p.soldUnits ?? 0) +
        finitePositive(p.internalDeliveredUnits ?? 0)
    );
  }
  for (const o of input.outcomes) {
    if (!input.isWideAccount(o.accountId)) continue;
    const lane = input.laneKey(o.commodity, o.book);
    sold.set(lane, (sold.get(lane) ?? 0) - finitePositive(o.deliveredUnits));
  }
  const out: Record<string, number> = {};
  for (const lane of [...made.keys()].sort()) {
    const m = made.get(lane)!;
    if (!(m > 0)) continue;
    const realSold = Math.max(0, sold.get(lane) ?? 0);
    out[lane] = Math.min(1, Math.max(0, (m - realSold) / m));
  }
  return out;
}

/**
 * How much bigger each persistently oversupplied lane's buyer is than the
 * base line. A lane whose new output went unsold beyond the threshold in each
 * of the recent turns gets a buyer of its smallest recent unsold share less
 * the target, between the base share and the cap; any other lane stays at
 * the base. It shrinks by itself as real demand catches up.
 */
export function wideEconomySurplusBoost(
  history: readonly Readonly<Record<string, number>>[]
): Map<string, number> {
  const boost = new Map<string, number>();
  if (history.length < WIDE_ECONOMY_SURPLUS_TURNS) return boost;
  const recent = history.slice(0, WIDE_ECONOMY_SURPLUS_TURNS);
  for (const lane of Object.keys(recent[0]!).sort()) {
    const surpluses = recent.map((turn) => turn[lane]);
    if (surpluses.some((u) => u == null || !(u > WIDE_ECONOMY_SURPLUS_THRESHOLD))) continue;
    const u = Math.min(...(surpluses as number[]));
    const share = Math.min(
      WIDE_ECONOMY_MAX_BUYER_SHARE,
      Math.max(WIDE_ECONOMY_DEMAND_SHARE, u - WIDE_ECONOMY_TARGET_SURPLUS)
    );
    if (share > WIDE_ECONOMY_DEMAND_SHARE) boost.set(lane, share / WIDE_ECONOMY_DEMAND_SHARE);
  }
  return boost;
}

/** The buyer's lines with each oversupplied lane scaled up (wideEconomySurplusBoost). */
export function wideEconomyBoostedOrders(
  base: readonly PurchaseOrder[],
  boostByLane: ReadonlyMap<string, number>,
  laneKey: (commodity: string, book: string) => string
): PurchaseOrder[] {
  return base.map((o) => {
    const factor = boostByLane.get(laneKey(o.commodity, o.book)) ?? 1;
    if (!(factor > 1)) return o;
    return {
      ...o,
      units: o.units * factor,
      ...(o.maximumSpend != null ? { maximumSpend: o.maximumSpend * factor } : {}),
    };
  });
}

interface SettledOffer {
  offeredUnits: number;
  deliveredUnits: number;
}

/**
 * The buyer's after-market orders: each line scaled to the plant output left
 * unsold on its lane at or below its bid, clearing after every other order
 * (afterMarket), so it never takes a unit a real buyer would have bought.
 */
export function residualWideEconomyBuyers(input: {
  buyerLines: readonly PurchaseOrder[];
  /** Real plant offers as posted, and how much of each sold. */
  plantOffers: readonly ProducerOffer[];
  offerResults: ReadonlyMap<string, SettledOffer>;
  laneKey: (commodity: string, book: string) => string;
  skip?: (commodity: string) => boolean;
}): PurchaseOrder[] {
  const skip = input.skip ?? (() => false);
  const lane = (x: { commodity: string; book: string }) => input.laneKey(x.commodity, x.book);
  const lines = input.buyerLines.filter((o) => !skip(o.commodity));
  const bidByLane = new Map<string, number>();
  const wantByLane = new Map<string, number>();
  for (const o of lines) {
    const k = lane(o);
    bidByLane.set(k, Math.max(bidByLane.get(k) ?? 0, finitePositive(o.maximumUnitPrice)));
    wantByLane.set(k, (wantByLane.get(k) ?? 0) + finitePositive(o.units));
  }
  const unsoldByLane = new Map<string, number>();
  for (const offer of input.plantOffers) {
    const k = lane(offer);
    const bid = bidByLane.get(k);
    if (bid == null || !(offer.unitPrice <= bid)) continue;
    const r = input.offerResults.get(offer.id);
    const left = r ? Math.max(0, r.offeredUnits - r.deliveredUnits) : 0;
    if (left > 0) unsoldByLane.set(k, (unsoldByLane.get(k) ?? 0) + left);
  }
  return lines.flatMap((o) => {
    const want = wantByLane.get(lane(o)) ?? 0;
    const free = unsoldByLane.get(lane(o)) ?? 0;
    if (!(want > 0) || !(free > 0)) return [];
    const share = Math.min(1, free / want);
    return [
      {
        ...o,
        units: o.units * share,
        ...(o.maximumSpend != null ? { maximumSpend: o.maximumSpend * share } : {}),
        afterMarket: true,
      },
    ];
  });
}

/**
 * The settled market as the rest of the turn reads it. The wider economy's
 * seller counts as supply in its country only for what it sold, and its own
 * book carries no clearing price, so it never moves a real lane's price or
 * the next turn's asks.
 */
export function withWideEconomyFills(
  market: ProducerMarketResult,
  sellerOffers: readonly ProducerOffer[]
): ProducerMarketResult {
  if (sellerOffers.length === 0) return market;
  const prefix = wideEconomyFillBook("");
  const prices = market.prices.filter((p) => !p.book.startsWith(prefix));
  if (!market.countryBooks) return { ...market, prices };
  const settled = new Map(market.offers.map((o) => [o.id, o]));
  const rows = new Map(
    market.countryBooks.map((r) => [JSON.stringify([r.countryId, r.commodity]), { ...r }])
  );
  for (const offer of sellerOffers) {
    const r = settled.get(offer.id);
    const row = rows.get(JSON.stringify([offer.countryId, offer.commodity]));
    if (!r || !row) continue;
    row.supply = Math.max(0, row.supply - Math.max(0, r.offeredUnits - r.deliveredUnits));
  }
  return { ...market, prices, countryBooks: sortFundedCountryBookRows([...rows.values()]) };
}

/**
 * What the wider economy's seller sold this clearing, one row per offer that
 * sold anything: the units the country book counts as its supply.
 */
export function wideEconomySales(
  market: Pick<ProducerMarketResult, "offers">,
  sellerOffers: readonly ProducerOffer[]
): WideEconomySale[] {
  const settled = new Map(market.offers.map((o) => [o.id, o]));
  const out: WideEconomySale[] = [];
  for (const offer of sellerOffers) {
    const units = settled.get(offer.id)?.deliveredUnits ?? 0;
    if (!(units > 0) || !offer.countryId) continue;
    out.push({
      accountId: offer.accountId,
      countryId: offer.countryId,
      commodity: offer.commodity,
      book: offer.book,
      units,
    });
  }
  return out;
}

/** Units and spend each order got from the wider economy's seller this clearing. */
export function wideEconomySeededFills(
  fills: readonly { orderId: string; units: number; unitPrice: number; spillBook?: string }[]
): Map<string, { units: number; cost: number }> {
  const prefix = wideEconomyFillBook("");
  const out = new Map<string, { units: number; cost: number }>();
  for (const f of fills) {
    if (!f.spillBook?.startsWith(prefix)) continue;
    const row = out.get(f.orderId) ?? { units: 0, cost: 0 };
    row.units += f.units;
    row.cost += f.units * f.unitPrice;
    out.set(f.orderId, row);
  }
  return out;
}
