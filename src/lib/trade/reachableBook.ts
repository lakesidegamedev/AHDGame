import type { CountryId } from "@/lib/constants/countries";
import type { CommodityType } from "@/lib/constants/commodities";
import type { ClearingResult } from "./types";
import { reachableDemandUnits } from "@/lib/market/tradePartition";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";

/**
 * Per-country, per-commodity REACHABLE market book, in commodity units.
 *
 * "Room in this market" signals must read this book, not the global aggregate.
 * The global aggregate sums three populations that cannot substitute:
 *
 *   1. reachable  - normal trade partners
 *   2. blocked    - real output behind an embargo wall
 *   3. untraded   - output from countries outside `COUNTRY_ORDER`, which the
 *                   clearing engine never sees
 *
 * `supply` and `demand` are the numbers to do arithmetic with. `blockedSupply`
 * and `untradedSupply` are DISCLOSURE ONLY: they let the UI name what it
 * excluded instead of showing a bare 0 that reads as a dead market. Never add
 * them back into a ratio.
 */
export interface ReachableBookEntry {
  /** What this country's own producers collectively made (S_H). */
  supply: number;
  /**
   * CLEARING demand: what existing producers fill THIS turn, net of imports.
   * See `reachableDemandUnits`. This is the engine's order-book quantity and is
   * NOT the right basis for "can new capacity sell" — see `reachableDemandGap`.
   */
  demand: number;
  /**
   * Domestic demand before any trade (D_H). Carried explicitly because the
   * clearing `demand` above is pinned to `supply` for every net importer by
   * construction, which destroys the information a build decision needs.
   */
  domesticDemand: number;
  /** Units imported, which is demand already served by someone else. */
  imports: number;
  /** Units exported, which is demand reached abroad. */
  exports: number;
  /** Disclosure: world supply an embargo keeps out of this country. */
  blockedSupply: number;
  /** Disclosure: world supply from countries that trade with nobody. */
  untradedSupply: number;
  /**
   * Foreign demand this country could win that nobody currently serves, in
   * units: its gravity share of every other country's unserved deficit.
   *
   * Without this term `reachableDemandGap` is identically zero for every net
   * exporter: `clearCommodity` scales the exporter row to exactly
   * `surplus = supply - domesticDemand`, so `domesticDemand + exports - supply`
   * cancels by construction.
   *
   * Optional so books persisted before this field heal to the old behaviour
   * rather than throwing; see {@link reachableDemandGap}.
   */
  unmetForeignDemand?: number;
}

export type ReachableBooks = Map<CountryId, Map<CommodityType, ReachableBookEntry>>;

/** Mongo-serialisable form of {@link ReachableBooks} (Maps do not persist). */
export type ReachableBooksDoc = Partial<
  Record<string, Partial<Record<CommodityType, ReachableBookEntry>>>
>;

export interface BuildReachableBooksArgs {
  /** Trading countries, i.e. `COUNTRY_ORDER`. Ids outside this list are untraded. */
  countries: CountryId[];
  /**
   * PRE-convergence national balances, keyed by EVERY country id present in the
   * ledger including untraded ones. Must be the same balances `clearing` was
   * computed on: `applyTradeConvergence` mutates them in place afterwards, and
   * reading the post-mutation values here would understate every deficit by the
   * convergence factor.
   */
  balances: ReadonlyMap<string, ReadonlyMap<CommodityType, { supply: number; demand: number }>>;
  /** Clearing results in UNITS, from `clearAllCommodities`. */
  clearing: ReadonlyMap<CommodityType, ClearingResult>;
  /** Commodities to build books for. */
  commodities: readonly CommodityType[];
  /**
   * Gravity affinity for `exporter -> importer`, the same prior the IPF in
   * `clearCommodity` fits against. Zero means the lane is closed (embargo or
   * iron curtain), which is the `isBlocked` this argument used to be — one
   * function instead of two, so a lane cannot be open for allocation and closed
   * for disclosure.
   */
  affinity: (commodity: CommodityType, exporter: CountryId, importer: CountryId) => number;
}

export function buildReachableBooks(args: BuildReachableBooksArgs): ReachableBooks {
  const { countries, balances, clearing, commodities, affinity } = args;

  const trading = new Set<string>(countries);
  const books: ReachableBooks = new Map();
  for (const c of countries) books.set(c, new Map());

  for (const commodity of commodities) {
    if (isStateScopedCommodity(commodity)) {
      // A local service cannot sell to a foreign deficit or compete with a
      // foreign surplus. State-level consumers refine this domestic aggregate.
      for (const home of countries) {
        const balance = balances.get(home)?.get(commodity);
        const supply = balance?.supply ?? 0;
        const demand = balance?.demand ?? 0;
        books.get(home)!.set(commodity, {
          supply,
          demand,
          domesticDemand: demand,
          imports: 0,
          exports: 0,
          blockedSupply: 0,
          untradedSupply: 0,
          unmetForeignDemand: 0,
        });
      }
      continue;
    }
    // Supply that reaches no market at all, identical for every viewer: it is
    // absent from the clearing engine, not merely walled off from one country.
    let untradedSupply = 0;
    for (const [countryId, byCommodity] of balances) {
      if (trading.has(countryId)) continue;
      untradedSupply += byCommodity.get(commodity)?.supply ?? 0;
    }

    const result = clearing.get(commodity);

    // `affinityFor` rescans the embargo list and reprices the importer tariff on
    // every call, and this pass needs each pair twice (once to weight the
    // unserved pool, once for the blocked-supply disclosure). Memoise per
    // commodity so the turn engine pays for each pair exactly once, as it did
    // when this argument was the narrower `isBlocked`.
    const affinityCache = new Map<string, number>();
    const affinityOf = (exporter: CountryId, importer: CountryId): number => {
      const key = `${exporter}|${importer}`;
      const hit = affinityCache.get(key);
      if (hit !== undefined) return hit;
      const value = affinity(commodity, exporter, importer);
      affinityCache.set(key, value);
      return value;
    };

    // Deficit each country still carries after clearing. `uncleared` is
    // positive for unsold surplus and negative for unmet demand, so a net
    // exporter contributes nothing to the pool.
    const unmetByCountry = new Map<CountryId, number>();
    for (const c of countries) {
      unmetByCountry.set(c, Math.max(0, -(result?.perCountry[c]?.uncleared ?? 0)));
    }

    // Gravity mass per exporter: affinity (can it reach this buyer) times supply
    // (can it serve at scale), normalised per importer so shares sum to 1. Affinity
    // alone let small well-connected countries quote the same room as large
    // producers; the raw pool unweighted made every book identical.
    const shareOfImporter = new Map<CountryId, Map<CountryId, number>>();
    for (const importer of countries) {
      if ((unmetByCountry.get(importer) ?? 0) <= 0) continue;
      const massByExporter = new Map<CountryId, number>();
      let totalMass = 0;
      for (const exporter of countries) {
        if (exporter === importer) continue;
        const a = affinityOf(exporter, importer);
        if (!(a > 0)) continue;
        const mass = a * (balances.get(exporter)?.get(commodity)?.supply ?? 0);
        if (!(mass > 0)) continue;
        massByExporter.set(exporter, mass);
        totalMass += mass;
      }
      if (totalMass <= 0) continue;
      const shares = new Map<CountryId, number>();
      for (const [exporter, mass] of massByExporter) shares.set(exporter, mass / totalMass);
      shareOfImporter.set(importer, shares);
    }

    for (const home of countries) {
      const bal = balances.get(home)?.get(commodity);
      const supply = bal?.supply ?? 0;
      const demand = bal?.demand ?? 0;
      const pc = result?.perCountry[home];
      const imports = pc?.imports ?? 0;
      const exports = pc?.exports ?? 0;

      let blockedSupply = 0;
      let unmetForeignDemand = 0;
      for (const other of countries) {
        if (other === home) continue;
        if (affinityOf(other, home) === 0) {
          blockedSupply += balances.get(other)?.get(commodity)?.supply ?? 0;
        }
        const unmet = unmetByCountry.get(other) ?? 0;
        if (unmet > 0) {
          unmetForeignDemand += unmet * (shareOfImporter.get(other)?.get(home) ?? 0);
        }
      }

      books.get(home)!.set(commodity, {
        supply,
        demand: reachableDemandUnits(demand, imports, exports),
        domesticDemand: demand,
        imports,
        exports,
        blockedSupply,
        untradedSupply,
        unmetForeignDemand,
      });
    }
  }

  return books;
}

/** Flatten to plain objects for persistence. */
export function serializeReachableBooks(books: ReachableBooks): ReachableBooksDoc {
  const out: ReachableBooksDoc = {};
  for (const [countryId, byCommodity] of books) {
    const entry: Partial<Record<CommodityType, ReachableBookEntry>> = {};
    for (const [commodity, book] of byCommodity) entry[commodity] = book;
    out[countryId] = entry;
  }
  return out;
}

/**
 * Room for NEW capacity in a country, in units.
 *
 * Deliberately NOT `demand - supply` on the clearing book: `clearCommodity`
 * nets imports to exactly `D - S`, so a gap off that book is identically zero
 * for any net importer. What a build needs is what new DOMESTIC output could
 * sell. Domestic production clears before imports, so extra domestic capacity
 * displaces imports one-for-one. Room is:
 *
 *     max(0, domesticDemand + exports - supply) + unmetForeignDemand
 *
 * The second term covers the same cancellation on the exporter side and is this
 * country's gravity share of unserved foreign deficit; both buyers are real.
 *
 * `domesticDemand` and `unmetForeignDemand` heal to sensible values for books
 * persisted before those fields existed.
 */
export function reachableDemandGap(book: ReachableBookEntry | undefined): number {
  if (!book) return 0;
  const domestic = domesticDemandOf(book);
  const displaceable = Math.max(0, domestic + book.exports - book.supply);
  const foreign = book.unmetForeignDemand;
  const reachableForeign = typeof foreign === "number" && Number.isFinite(foreign) ? foreign : 0;
  return displaceable + Math.max(0, reachableForeign);
}

/**
 * `domesticDemand`, healing a book written before the field was added by
 * inverting the clearing formula: `demand = max(0, D - imports) + exports`, so
 * `D = demand - exports + imports` whenever imports did not zero it out. Books
 * carrying the field use it directly.
 */
/**
 * Demand a seller in this country can actually win: domestic buyers (domestic
 * output clears before imports) plus placeable exports. The numerator the
 * Reachable lens ranks on, and the basis {@link reachableDemandGap} nets supply
 * out of, so the map, the panel and the build gate cannot disagree.
 */
export function reachableSellableDemand(book: ReachableBookEntry): number {
  return domesticDemandOf(book) + book.exports;
}

export function domesticDemandOf(book: ReachableBookEntry): number {
  if (typeof book.domesticDemand === "number" && Number.isFinite(book.domesticDemand)) {
    return book.domesticDemand;
  }
  return Math.max(0, book.demand - book.exports + book.imports);
}
