/**
 * Reachable books rebuilt from the funded market itself.
 *
 * The commodity price phase used to build every country's reachable book from
 * MODELLED trade: `buildReachableBooks` counted a country's imports and
 * exports from the gravity clearing, so a country the model shipped gas to
 * looked supplied even when no funded buyer there could reach a seller. The
 * funded market already knows what its buyers ordered and what actually
 * changed hands across borders, so on a funded turn the book is rebuilt from
 * those orders and fills instead.
 *
 * Units are the price phase's per-turn basis (funded orders and fills scaled
 * by TURNS_PER_DAY when the rows are persisted), the same basis the funded
 * ledger uses, so `reachableDemandUnits` and the price knee read the book the
 * market actually cleared on.
 *
 * Pure: rows in, books out. No DB and no money.
 */
import type { CountryId } from "@/lib/constants/countries";
import type { CommodityType } from "@/lib/constants/commodities";
import type { ReachableBooks } from "@/lib/trade/reachableBook";
import { reachableDemandUnits } from "@/lib/market/tradePartition";

/** One country's funded book for one commodity, in the price phase's units. */
export interface FundedCountryBookRow {
  countryId: string;
  commodity: string;
  /** Units producers in the country offered on the funded market. */
  supply: number;
  /** Units buyers in the country ordered, before any fill. */
  demand: number;
  /** Units bought from a seller in another country. */
  imports: number;
  /** Units sold to a buyer in another country. */
  exports: number;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Deterministic order so a persisted book and its digest do not depend on Map insertion. */
export function sortFundedCountryBookRows(
  rows: readonly FundedCountryBookRow[]
): FundedCountryBookRow[] {
  return [...rows].sort(
    (a, b) => compareText(a.commodity, b.commodity) || compareText(a.countryId, b.countryId)
  );
}

/**
 * Build the reachable book the price phase prices from, keyed exactly like
 * `buildReachableBooks`: supply as offered, demand as reachable order volume.
 * Countries and commodities with no funded activity are omitted, so the price
 * phase skips them the same way it skips an empty modelled book.
 */
export function fundedReachableBooks(
  rows: readonly FundedCountryBookRow[],
  countries: readonly CountryId[],
  commodities: readonly CommodityType[]
): ReachableBooks {
  const books: ReachableBooks = new Map();
  for (const country of countries) books.set(country, new Map());
  const known = new Set<string>(countries);
  const wanted = new Set<string>(commodities);
  for (const row of rows) {
    if (!known.has(row.countryId) || !wanted.has(row.commodity)) continue;
    const finite = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
    const supply = finite(row.supply);
    const demand = finite(row.demand);
    const imports = finite(row.imports);
    const exports = finite(row.exports);
    if (supply === 0 && demand === 0 && imports === 0 && exports === 0) continue;
    books.get(row.countryId as CountryId)!.set(row.commodity as CommodityType, {
      supply,
      demand: reachableDemandUnits(demand, imports, exports),
      domesticDemand: demand,
      imports,
      exports,
      blockedSupply: 0,
      untradedSupply: 0,
      unmetForeignDemand: 0,
    });
  }
  return books;
}

/**
 * Dark-by-default selector: the modelled book stays in force unless the stage
 * is on AND the funded market published a book for the turn. Absent rows on an
 * early funded turn fall back rather than zeroing every price.
 */
export function selectFundedReachableBooks(input: {
  stage: number | undefined;
  rows: readonly FundedCountryBookRow[] | undefined;
  countries: readonly CountryId[];
  commodities: readonly CommodityType[];
  modelled: ReachableBooks;
}): ReachableBooks {
  if ((input.stage ?? 0) < 1 || !input.rows || input.rows.length === 0) return input.modelled;
  return fundedReachableBooks(input.rows, input.countries, input.commodities);
}
