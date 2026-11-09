/**
 * Country market views read from the funded country book.
 *
 * `commodityPrices.nationalDemand` is rolled up from the funded ledger by the
 * buyer's STATE. Public, military and investment buyers order from a national
 * wallet with no state, so their orders reach the world total and the
 * per-country funded book but never a country's `nationalDemand`. A country
 * whose demand is mostly public (ordnance, building materials, construction)
 * then read as a glut while its funded book was short.
 *
 * On a turn the funded market published a book, a country view reads that
 * book instead: supply is what the country's producers offered, demand is what
 * its buyers requested (the reservation and its public fallback counted once),
 * and the fill is what they actually received. Household substitution orders
 * placed after a first choice sold out (spillover) are not first-choice
 * demand: they are left out of `demand` and reported as `spilloverRequested`,
 * so a cheap good that caught spilled budget does not read as short. Units
 * they bought still count in `filled`. World totals are unchanged:
 * `globalSupply` / `globalDemand` are already the sum of the same orders.
 * Countries absent from the book had no funded activity and read as empty.
 * Without a book for the price row's turn the stored national fields stand.
 *
 * Pure: rows in, view out. No DB.
 */
import type { ReachableBookEntry } from "@/lib/trade/reachableBook";
import { reachableDemandUnits } from "@/lib/market/tradePartition";
import type { FundedCountryBookRow } from "./fundedBookRules";

/** Where a country view's supply and demand came from. */
export type NationalBalanceSource = "funded_book" | "modelled";

/** One country's funded market for one commodity, as a view shows it. */
export interface FundedCountryMarket {
  /** Units producers in the country offered. */
  supply: number;
  /**
   * First-choice units buyers in the country requested (`requested`, else
   * `demand`), less household spillover.
   */
  demand: number;
  /** Household spillover units left out of `demand`; 0 when none was recorded. */
  spilloverRequested: number;
  /** Units buyers in the country received; null on books written before fills were recorded. */
  filled: number | null;
  /** Part of `demand` the buyers' cash could pay for; null when not recorded. */
  funded: number | null;
  imports: number;
  exports: number;
}

/** The funded book a turn published, or null when there is none. */
export interface FundedBooksForTurn {
  turn: number;
  rows: readonly FundedCountryBookRow[];
}

const nonNegative = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const optional = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;

export function fundedCountryMarket(row: FundedCountryBookRow): FundedCountryMarket {
  const requested = nonNegative(row.requested ?? row.demand);
  const spilloverRequested = Math.min(requested, nonNegative(row.spilloverRequested));
  return {
    supply: nonNegative(row.supply),
    demand: requested - spilloverRequested,
    spilloverRequested,
    filled: optional(row.filled),
    funded: optional(row.funded),
    imports: nonNegative(row.imports),
    exports: nonNegative(row.exports),
  };
}

/** commodity -> country -> funded market. */
export function fundedCountryMarketsByCommodity(
  rows: readonly FundedCountryBookRow[]
): Map<string, Record<string, FundedCountryMarket>> {
  const out = new Map<string, Record<string, FundedCountryMarket>>();
  for (const row of rows) {
    const byCountry = out.get(row.commodity) ?? {};
    byCountry[row.countryId] = fundedCountryMarket(row);
    out.set(row.commodity, byCountry);
  }
  return out;
}

type NationalFields = {
  commodity: string;
  turn?: number;
  nationalSupply?: Record<string, number>;
  nationalDemand?: Record<string, number>;
};

export type WithNationalBalanceSource<T> = T & {
  nationalBalanceSource: NationalBalanceSource;
  /** Present only when `nationalBalanceSource` is "funded_book". */
  fundedCountryBooks?: Record<string, FundedCountryMarket>;
};

/**
 * Replace a price row's national supply and demand with the funded book when
 * the book belongs to the row's turn. Pass `byCommodity` from
 * `fundedCountryMarketsByCommodity` to share the pivot across rows.
 */
export function overlayFundedNationalBalances<T extends NationalFields>(
  price: T,
  books: FundedBooksForTurn | null,
  byCommodity: Map<string, Record<string, FundedCountryMarket>> = books
    ? fundedCountryMarketsByCommodity(books.rows)
    : new Map()
): WithNationalBalanceSource<T> {
  if (!books || books.rows.length === 0 || price.turn !== books.turn) {
    return { ...price, nationalBalanceSource: "modelled" };
  }
  const markets = byCommodity.get(price.commodity) ?? {};
  const nationalSupply: Record<string, number> = {};
  const nationalDemand: Record<string, number> = {};
  for (const [countryId, market] of Object.entries(markets)) {
    nationalSupply[countryId] = market.supply;
    nationalDemand[countryId] = market.demand;
  }
  return {
    ...price,
    nationalSupply,
    nationalDemand,
    nationalBalanceSource: "funded_book",
    fundedCountryBooks: markets,
  };
}

/** The turn a set of price rows was written on (the newest), or null. */
export function priceRowsTurn(prices: readonly { turn?: number }[]): number | null {
  let turn: number | null = null;
  for (const p of prices)
    if (typeof p.turn === "number" && Number.isFinite(p.turn) && (turn === null || p.turn > turn))
      turn = p.turn;
  return turn;
}

/**
 * The reachable-book entries one commodity's funded country markets imply,
 * shaped like `fundedReachableBooks` builds them for the price phase, so the
 * map's Reachable lens shows the book prices were set from. Demand here is
 * first-choice `requested` like every other country view; the price phase
 * reads `demand`, which also counts a reservation and its public fallback
 * twice and includes household spillover.
 */
export function fundedReachableBookEntries(
  markets: Readonly<Record<string, FundedCountryMarket>>
): Record<string, ReachableBookEntry> {
  const out: Record<string, ReachableBookEntry> = {};
  for (const [countryId, m] of Object.entries(markets)) {
    if (m.supply === 0 && m.demand === 0 && m.imports === 0 && m.exports === 0) continue;
    out[countryId] = {
      supply: m.supply,
      demand: reachableDemandUnits(m.demand, m.imports, m.exports),
      domesticDemand: m.demand,
      imports: m.imports,
      exports: m.exports,
      blockedSupply: 0,
      untradedSupply: 0,
      unmetForeignDemand: 0,
    };
  }
  return out;
}
