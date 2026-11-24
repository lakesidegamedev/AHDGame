/**
 * The wider economy: a background buyer and seller in every plant-country
 * state. Sized once from a market baseline (a share of each good's demand),
 * split by real GDP share and grown only with real GDP. It trades only after
 * the market has cleared: the buyer takes output no real buyer bought, the
 * seller fills orders no plant could fill (see residualWideEconomyLines).
 *
 * Pure: market baseline, states, prices and book mapping in, orders out.
 */
import type { ProducerOffer, PurchaseOrder } from "./producerQuotes";

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
  /** Annual state GDP deflated by its country's price index. */
  realGdp: number;
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
  /** Baseline real GDP of each plant-country state. */
  realGdp: Record<string, number>;
  /** Country of each baseline state. */
  countryOfState: Record<string, string>;
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
  for (const s of [...input.states].sort((a, b) => (a.stateId < b.stateId ? -1 : 1))) {
    const gdp = finitePositive(s.realGdp);
    if (!(gdp > 0) || !s.countryId) continue;
    realGdp[s.stateId] = gdp;
    countryOfState[s.stateId] = s.countryId;
  }
  return { units, realGdp, countryOfState };
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
 * A state's share of a good is the baseline units times its baseline share of
 * real GDP, grown by its own real GDP since the baseline. State-scoped goods
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
      const units = (units0 * now) / totalGdp0;
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
 * The after-market pass. The background buyer may take only what plants offered
 * and did not sell on each lane, and the background seller may fill only what
 * real buyers ordered and did not get, so neither competes with a real trade.
 * Each line is scaled down to its lane's room; lanes with no room drop out.
 */
export function residualWideEconomyLines(input: {
  orders: readonly PurchaseOrder[];
  offers: readonly ProducerOffer[];
  unsoldByLane: ReadonlyMap<string, number>;
  unmetByLane: ReadonlyMap<string, number>;
  laneKey: (commodity: string, book: string) => string;
}): { orders: PurchaseOrder[]; offers: ProducerOffer[] } {
  const scale = <T extends { commodity: string; book: string; units: number }>(
    lines: readonly T[],
    room: ReadonlyMap<string, number>
  ) => {
    const want = new Map<string, number>();
    for (const l of lines) {
      const k = input.laneKey(l.commodity, l.book);
      want.set(k, (want.get(k) ?? 0) + finitePositive(l.units));
    }
    return lines.flatMap((l) => {
      const k = input.laneKey(l.commodity, l.book);
      const total = want.get(k) ?? 0;
      const free = finitePositive(room.get(k) ?? 0);
      if (!(total > 0) || !(free > 0)) return [];
      const share = Math.min(1, free / total);
      return [{ line: l, share }];
    });
  };
  const orders = scale(input.orders, input.unsoldByLane).map(({ line, share }) => ({
    ...line,
    units: line.units * share,
    maximumSpend: line.maximumSpend * share,
  }));
  const offers = scale(input.offers, input.unmetByLane).map(({ line, share }) => ({
    ...line,
    units: line.units * share,
  }));
  return { orders, offers };
}
