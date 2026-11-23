/**
 * The wider economy: a background buyer in every plant-country state. Sized
 * once from a market baseline (the room between demand and 1.1x supply per
 * good), split by real GDP share and grown only with real GDP. It bids the
 * reference price at most and counts as demand only for what it buys.
 *
 * Pure: market baseline, states, prices and book mapping in, orders out.
 */
import type { PurchaseOrder } from "./producerQuotes";

/** The buyer fills demand up to this multiple of baseline supply. */
export const WIDE_ECONOMY_SUPPLY_HEADROOM = 1.1;

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
  /** Units per turn the buyer takes of each good at baseline real GDP. */
  units: Record<string, number>;
  /** Baseline real GDP of each plant-country state. */
  realGdp: Record<string, number>;
  /** Country of each baseline state. */
  countryOfState: Record<string, string>;
}

const finitePositive = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * The baseline from recent settled turns. Supply is everything offered
 * (plants and background countries) and demand everything ordered; a turn's
 * rows are summed per good, then the turns are averaged.
 */
export function wideEconomyBaseline(input: {
  turns: readonly (readonly WideEconomyMarketRow[])[];
  states: readonly WideEconomyState[];
}): WideEconomyBaseline {
  const turns = input.turns.filter((rows) => rows.length > 0);
  const supply = new Map<string, number>();
  const demand = new Map<string, number>();
  for (const rows of turns)
    for (const r of rows) {
      supply.set(r.commodity, (supply.get(r.commodity) ?? 0) + finitePositive(r.supply));
      demand.set(r.commodity, (demand.get(r.commodity) ?? 0) + finitePositive(r.demand));
    }
  const units: Record<string, number> = {};
  if (turns.length > 0)
    for (const commodity of [...supply.keys()].sort()) {
      const s = supply.get(commodity)! / turns.length;
      const d = (demand.get(commodity) ?? 0) / turns.length;
      const cap = WIDE_ECONOMY_SUPPLY_HEADROOM * s;
      // A good whose demand already reaches 1.1x supply was short: nothing.
      if (d >= cap * (1 - 1e-9)) continue;
      units[commodity] = cap - d;
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

/**
 * This turn's orders. A state's share of a good is the baseline units times
 * its baseline share of real GDP, grown by its own real GDP since the
 * baseline. State-scoped goods order on the state's book (then `mapBook`, as
 * public orders do); every other good orders once per country on the world
 * book and reaches sellers the way that country's households do.
 */
export function wideEconomyOrders(input: {
  baseline: WideEconomyBaseline;
  /** Current real GDP per state; states not in the baseline are ignored. */
  realGdpNow: ReadonlyMap<string, number>;
  accountId: (countryId: string) => string;
  /** Reference price of a good; the state id is empty for a world-book good. */
  referencePrice: (commodity: string, stateId: string) => number | null;
  isStateScoped: (commodity: string) => boolean;
  mapBook: (book: string, commodity: string, countryId: string) => string;
}): PurchaseOrder[] {
  const states = Object.keys(input.baseline.realGdp).sort();
  const totalGdp0 = states.reduce((sum, id) => sum + input.baseline.realGdp[id]!, 0);
  if (!(totalGdp0 > 0)) return [];
  const byId = new Map<string, PurchaseOrder>();
  const add = (
    countryId: string,
    commodity: string,
    book: string,
    units: number,
    price: number
  ) => {
    const id = wideEconomyOrderId(countryId, commodity, book);
    const same = byId.get(id);
    if (same) {
      // A shared book (country-wide services) bids the lowest of its states' prices.
      same.units += units;
      same.maximumUnitPrice = Math.min(same.maximumUnitPrice, price);
      same.maximumSpend = same.units * same.maximumUnitPrice;
      return;
    }
    byId.set(id, {
      id,
      accountId: input.accountId(countryId),
      commodity,
      book,
      units,
      maximumUnitPrice: price,
      maximumSpend: units * price,
      countryId,
      // Counted as demand only for what it buys (see productionOrderOutcomes).
      demandStep: 1,
    });
  };
  for (const commodity of Object.keys(input.baseline.units).sort()) {
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
      add(
        countryId,
        commodity,
        input.mapBook(`state:${stateId}`, commodity, countryId),
        units,
        price
      );
    }
    if (scoped) continue;
    const price = input.referencePrice(commodity, "");
    if (price == null || !(finitePositive(price) > 0)) continue;
    for (const [countryId, units] of [...worldUnits].sort(([a], [b]) => (a < b ? -1 : 1)))
      add(countryId, commodity, "world", units, price);
  }
  return [...byId.values()];
}
