/**
 * Stores: the retail sector resells finished goods to households at cost plus a
 * markup. Pure rules, no database, clock or randomness.
 *
 * A store transforms nothing. Households buy a good through a store, the store
 * pays the producer's price and keeps the markup on top. Stores sell only to
 * households, and only the goods listed in STORE_ROUTED_SHARE: never weapons,
 * never business goods.
 */
import type { CommodityType } from "@/lib/constants/commodities";

/** Share of each household good's spending that goes through stores. */
export const STORE_ROUTED_SHARE: Readonly<Partial<Record<CommodityType, number>>> = {
  food: 0.6,
  consumer_goods: 1,
  electronics: 0.7,
};

export const STORE_MARKUP_DEFAULT = 0.15;
export const STORE_MARKUP_MIN = 0.1;
/** Highest markup the operator may set, including the start of the changeover. */
export const STORE_MARKUP_MAX = 0.4;

/**
 * Value of goods one unit of store capacity can resell per turn, as a multiple
 * of the value the old basket recipe produced per unit. Sets how many stores a
 * state needs for its household demand, and how much a store's running costs
 * are per unit of goods resold.
 *
 * 4.5 is sized on live turns 232 to 235: a busy store spends about 110 per
 * capacity unit a turn (70 running inputs, 40 wages and site bills) and,
 * with consumer goods on sale, resells about 590 of goods per unit at the old
 * multiple of 3. At 4.5 that is about 880 resold per unit, so at the 15%
 * markup the store earns about 132 of markup, adds about 62 of value over its
 * running inputs and keeps about 22: roughly 35% of its value added.
 */
export const STORE_THROUGHPUT_MULTIPLE = 4.5;

/**
 * Turns the changeover markup takes to step down to the standing markup, and
 * the markup it starts from, when gameConfig.storeTransition leaves them out.
 */
export const STORE_TRANSITION_DEFAULT_TURNS = 12;
export const STORE_TRANSITION_DEFAULT_START_MARKUP = 0.4;

/**
 * Yardstick for store capacity, not an output: a store makes nothing, so its
 * strategies list no supply. Capacity sizing, build prices and the run size
 * read this mix instead, at the unit yield the retired basket recipe had, so
 * every existing site keeps the same size and price. Advertising's base price
 * (150 per unit) is what reproduces it.
 */
export const STORE_THROUGHPUT_BASIS: Readonly<Partial<Record<CommodityType, number>>> = {
  advertising: 0.5,
};

/** The mix capacity is measured against: a store's yardstick when a strategy lists no supply. */
export function sizingSupply<T extends Partial<Record<CommodityType, number>>>(
  supply: T | null | undefined
): Partial<Record<CommodityType, number>> {
  return supply && Object.keys(supply).length > 0 ? supply : STORE_THROUGHPUT_BASIS;
}

/** Goods a store may resell. Anything else is bought direct by households. */
export function isStoreGood(commodity: string): commodity is keyof typeof STORE_ROUTED_SHARE {
  return Object.prototype.hasOwnProperty.call(STORE_ROUTED_SHARE, commodity);
}

export function storeRoutedShare(commodity: string): number {
  return isStoreGood(commodity) ? (STORE_ROUTED_SHARE[commodity] ?? 0) : 0;
}

/** A configured markup, kept inside its allowed band; a missing or bad value reads as the default. */
export function clampStoreMarkup(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return STORE_MARKUP_DEFAULT;
  return Math.min(STORE_MARKUP_MAX, Math.max(STORE_MARKUP_MIN, value));
}

/**
 * Share of a state's store-routed household demand its stores can serve. The
 * rest is bought direct from producers at the producer price, so a producer
 * never loses a sale because stores are missing.
 */
export function storeCoverage(capacityValue: number, routedDemandValue: number): number {
  if (!(routedDemandValue > 0)) return capacityValue > 0 ? 1 : 0;
  if (!(capacityValue > 0) || !Number.isFinite(capacityValue)) return 0;
  return Math.min(1, capacityValue / routedDemandValue);
}

/**
 * A busy store's running costs as a share of the wholesale value it resells,
 * at STORE_THROUGHPUT_MULTIPLE: about 110 per capacity unit against about 880
 * of goods (live turns 232 to 235). The changeover steps the markup down so
 * that what it leaves above this share shrinks by the same fraction each turn.
 */
export const STORE_TYPICAL_RUNNING_COST_SHARE = 0.125;

/**
 * The changeover from retail baskets to stores. A store's markup starts at
 * `startMarkup` on `startTurn` and comes down to the standing markup over
 * `turns` turns, so a retail company's profit moves a little each turn
 * instead of all at once.
 */
export interface StoreTransition {
  startTurn?: number;
  turns?: number;
  startMarkup?: number;
}

/**
 * Markup stores charge on `turn`. Without a changeover (or once it is over)
 * this is the standing markup. Before the start it is the start markup.
 * In between, the markup's margin over a typical store's running costs falls
 * by the same fraction every turn, so a typical store's profit does too
 * (equal steps in the markup would make the last steps the steepest).
 */
export function storeMarkupForTurn(input: {
  standingMarkup: number | null | undefined;
  transition: StoreTransition | null | undefined;
  turn: number;
}): number {
  const standing = clampStoreMarkup(input.standingMarkup);
  const t = input.transition;
  if (!t || typeof t.startTurn !== "number" || !Number.isFinite(t.startTurn)) return standing;
  const turns =
    typeof t.turns === "number" && Number.isFinite(t.turns) && t.turns >= 1
      ? Math.round(t.turns)
      : STORE_TRANSITION_DEFAULT_TURNS;
  const start = clampStoreMarkup(t.startMarkup ?? STORE_TRANSITION_DEFAULT_START_MARKUP);
  const step = input.turn - t.startTurn;
  if (step < 0) return start;
  if (step >= turns || start === standing) return standing;
  const cost = STORE_TYPICAL_RUNNING_COST_SHARE;
  // Geometric in the margin over running costs when both ends clear them; a
  // straight line otherwise (a standing markup at or under the cost share).
  if (start > cost && standing > cost)
    return cost + (start - cost) * Math.pow((standing - cost) / (start - cost), step / turns);
  return start + ((standing - start) * step) / turns;
}

/** Markup a household pays on top of the wholesale price it paid through a store. */
export function storeMarkupOn(wholesaleValue: number, markup: number): number {
  return wholesaleValue > 0 ? wholesaleValue * markup : 0;
}

/**
 * Share of a household budget set aside for goods bought through a store. The
 * markup is paid on top of the wholesale value, so the order buys with
 * budget / (1 + markup) and the whole purchase stays inside the budget.
 */
export function wholesaleBudget(budget: number, markup: number): number {
  return budget / (1 + markup);
}

/** Split `total` across stores pro rata to their weight; weights of zero get nothing. */
export function allocateByWeight(
  stores: readonly { id: string; weight: number }[],
  total: number
): Map<string, number> {
  const out = new Map<string, number>();
  const sum = stores.reduce((n, s) => n + (s.weight > 0 ? s.weight : 0), 0);
  if (!(sum > 0) || !(total > 0)) return out;
  for (const s of stores) if (s.weight > 0) out.set(s.id, (total * s.weight) / sum);
  return out;
}

/** One store's turn, laid out so the rows add up. */
export interface StoreLedger {
  /** Wholesale value of the goods the store bought from producers. */
  goodsBoughtWholesale: number;
  /** What households paid the store: wholesale plus markup. */
  soldToHouseholds: number;
  /** Markup earned: sold to households minus goods bought wholesale. */
  markupEarned: number;
  /** Wages, site bills and running inputs. */
  runningCosts: number;
  /** Markup earned minus running costs. */
  margin: number;
}

export function storeLedger(input: {
  goodsBoughtWholesale: number;
  markupEarned: number;
  runningCosts: number;
}): StoreLedger {
  const goods = Math.max(0, input.goodsBoughtWholesale);
  const markup = Math.max(0, input.markupEarned);
  const running = Math.max(0, input.runningCosts);
  return {
    goodsBoughtWholesale: goods,
    soldToHouseholds: goods + markup,
    markupEarned: markup,
    runningCosts: running,
    margin: markup - running,
  };
}

/**
 * Capacity units of new store capacity a state's household demand still wants:
 * the routed demand its stores could not serve, over the goods value one
 * capacity unit resells. A state with no stores yet uses the average over the
 * states that have them. Null when nothing can be read.
 */
export function storeUnmetRunUnits(
  coverageByState: Readonly<
    Record<string, { capacityValue: number; runUnits: number; routedDemandValue: number }>
  >,
  stateId: string
): number | null {
  const row = coverageByState[stateId];
  if (!row) return null;
  const gap = Math.max(0, row.routedDemandValue - row.capacityValue);
  let perUnit = row.runUnits > 0 ? row.capacityValue / row.runUnits : 0;
  if (!(perUnit > 0)) {
    let value = 0;
    let units = 0;
    for (const r of Object.values(coverageByState)) {
      value += r.capacityValue;
      units += r.runUnits;
    }
    perUnit = units > 0 ? value / units : 0;
  }
  return perUnit > 0 ? gap / perUnit : null;
}

/** What households bought of one good, through stores and direct, per turn. */
export interface HouseholdChannelTotals {
  storeUnits: number;
  storeValue: number;
  directUnits: number;
  directValue: number;
  /** Wholesale value plus markup, as a share of everything households paid for the good. */
  storeShareOfSpend: number | null;
  markup: number;
}

export function householdChannelTotals(
  channels: readonly {
    commodity: string;
    storeUnits: number;
    storeValue: number;
    directUnits: number;
    directValue: number;
  }[],
  commodity: string,
  markup: number
): HouseholdChannelTotals | null {
  const rows = channels.filter((c) => c.commodity === commodity);
  if (rows.length === 0) return null;
  const sum = (pick: (c: (typeof rows)[number]) => number) => rows.reduce((n, c) => n + pick(c), 0);
  const storeValue = sum((c) => c.storeValue);
  const directValue = sum((c) => c.directValue);
  const paid = storeValue * (1 + markup) + directValue;
  return {
    storeUnits: sum((c) => c.storeUnits),
    storeValue,
    directUnits: sum((c) => c.directUnits),
    directValue,
    storeShareOfSpend: paid > 0 ? (storeValue * (1 + markup)) / paid : null,
    markup,
  };
}
