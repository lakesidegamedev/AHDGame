/**
 * Background countries as buyers and sellers in their own national book (#5702).
 *
 * A background country runs no sectors and seats no households, so the
 * engine's state-built legs say nothing about it. Its macro contribution (the
 * traded share of its aggregate supply and demand) is already in the world
 * total; this places the same units in the country's own regions, pro rata by
 * regional GDP, so the national book the trade clearing reads, the freight
 * sourcing network, tariffs, embargoes and the reachable books all see it the
 * way they see any other country. A country with no priced region keeps the
 * units in a stateless national row instead.
 *
 * Pure: balances in, balances mutated in place. No double count: the world
 * total is not touched here.
 */
import { COMMODITY_TYPES, type CommodityType } from "@/lib/constants/commodities";
import type { MacroMarketContribution } from "../types";

type Balance = { supply: number; demand: number };
type Book = Map<CommodityType, Balance>;

export interface BackgroundCountryContribution {
  countryId: string;
  contribution: MacroMarketContribution;
}

function denseBook(): Book {
  return new Map(COMMODITY_TYPES.map((c) => [c, { supply: 0, demand: 0 }]));
}

/**
 * Add each background country's contribution to its state books (by GDP
 * share). Returns the contributions that had no region to land in, for the
 * caller to add to the national book directly.
 */
export function placeBackgroundBooksInStates(
  contributions: readonly BackgroundCountryContribution[],
  stateGdpByCountry: ReadonlyMap<string, ReadonlyMap<string, number>>,
  byState: Map<string, Book>
): BackgroundCountryContribution[] {
  const unplaced: BackgroundCountryContribution[] = [];
  for (const item of contributions) {
    const states = stateGdpByCountry.get(item.countryId);
    const total = states ? [...states.values()].reduce((sum, gdp) => sum + gdp, 0) : 0;
    if (!states || total <= 0) {
      unplaced.push(item);
      continue;
    }
    for (const [stateId, gdp] of states) {
      const share = gdp / total;
      if (!(share > 0)) continue;
      const book = byState.get(stateId) ?? denseBook();
      byState.set(stateId, book);
      for (const [commodity, bal] of Object.entries(item.contribution.byCommodity) as [
        CommodityType,
        Balance,
      ][]) {
        const target = book.get(commodity);
        if (!target) continue;
        target.supply += bal.supply * share;
        target.demand += bal.demand * share;
      }
    }
  }
  return unplaced;
}

/** Add contributions with no region straight to the national book. */
export function addBackgroundBooksToCountries(
  contributions: readonly BackgroundCountryContribution[],
  byCountry: Map<string, Book>
): void {
  for (const item of contributions) {
    const book = byCountry.get(item.countryId) ?? denseBook();
    byCountry.set(item.countryId, book);
    for (const [commodity, bal] of Object.entries(item.contribution.byCommodity) as [
      CommodityType,
      Balance,
    ][]) {
      const target = book.get(commodity);
      if (!target) continue;
      target.supply += bal.supply;
      target.demand += bal.demand;
    }
  }
}

/**
 * The background-tier countries' contributions, keyed by country. A macro
 * document counts only when the tier resolver names its entity a background
 * country: background-macro documents for entities that are not registered
 * countries stay world-only, and a registered country the resolver runs in
 * full keeps its state-built book untouched.
 */
export function backgroundCountryContributions(
  tagged: readonly { entityId: string; contribution: MacroMarketContribution }[],
  backgroundCountryIds: ReadonlySet<string>
): BackgroundCountryContribution[] {
  return tagged
    .filter((item) => backgroundCountryIds.has(item.entityId))
    .map((item) => ({ countryId: item.entityId, contribution: item.contribution }));
}
