/**
 * Corporate market access depends on domestic demand and feasible foreign trade.
 * buildCountryClearingBooks applies the shared supply, tariff-budget and embargo rules.
 */
import type { CountryId } from "@/lib/constants/countries";
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { clearCommodity } from "@/lib/trade/clearing";

/**
 * Per-country order books for the corporate clearing pass.
 *
 * Instead of one worldwide book per commodity (every seller pro-rata on global
 * lagged demand, no borders), these scope each seller to the demand its home
 * country can actually REACH under the live trade-policy graph: embargoes
 * block, tariffs and geography drag, embargo caps clamp. Reuses the same
 * gravity clearing (`clearCommodity` + `buildTradeAffinity`) as the world
 * trade snapshot.
 *
 * For country H and commodity c over LAGGED national balances:
 *
 *   book.supply = S_H                       (what H's sellers collectively made)
 *   book.demand = max(0, D_H - imports_H) + exports_H
 *
 * domestic demand kept after import competition plus export volume the trade
 * graph lets them place abroad. A country whose surplus cannot leave sees its
 * book demand pinned at reachable volume and its sellers' fills fall instead
 * of exporting the glut into every open economy.
 *
 * Pure: consumes lagged balances and affinity functions, no DB.
 */
export type CountryClearingBooks = Map<
  CountryId,
  Map<CommodityType, { supply: number; demand: number }>
>;

/**
 * The sellable demand a country's producers face, in units.
 *
 * ONE definition, shared by the engine's clearing books and every player-facing
 * surface that quotes market room. A quote that disagrees with clearing is
 * worse than no quote, so neither side gets its own copy of this.
 */
export function reachableDemandUnits(demand: number, imports: number, exports: number): number {
  return Math.max(0, demand - imports) + exports;
}

export function buildCountryClearingBooks(args: {
  countries: CountryId[];
  /** Lagged per-country balances (prior turn's ledger), in units. */
  nationalBalances: ReadonlyMap<
    CountryId,
    ReadonlyMap<CommodityType, { supply: number; demand: number }>
  >;
  affinityFor: (commodity: CommodityType, exporter: CountryId, importer: CountryId) => number;
  capUnitsFor?: (
    commodity: CommodityType,
    exporter: CountryId,
    importer: CountryId
  ) => number | undefined;
  importCostMultiplierFor?: (
    commodity: CommodityType,
    exporter: CountryId,
    importer: CountryId
  ) => number | undefined;
}): CountryClearingBooks {
  const { countries, nationalBalances, affinityFor, capUnitsFor, importCostMultiplierFor } = args;

  const books: CountryClearingBooks = new Map();
  for (const c of countries) {
    books.set(c, new Map());
  }

  for (const commodity of COMMODITY_TYPES) {
    const supply: Partial<Record<CountryId, number>> = {};
    const demand: Partial<Record<CountryId, number>> = {};
    let any = false;
    for (const c of countries) {
      const bal = nationalBalances.get(c)?.get(commodity);
      supply[c] = bal?.supply ?? 0;
      demand[c] = bal?.demand ?? 0;
      if ((supply[c] ?? 0) > 0 || (demand[c] ?? 0) > 0) any = true;
    }
    if (!any) continue;

    const result = clearCommodity({
      countries,
      supply,
      demand,
      affinity: (e, i) => affinityFor(commodity, e, i),
      capUnits: capUnitsFor ? (e, i) => capUnitsFor(commodity, e, i) : undefined,
      importCostMultiplier: importCostMultiplierFor
        ? (e, i) => importCostMultiplierFor(commodity, e, i)
        : undefined,
    });

    for (const c of countries) {
      const s = supply[c] ?? 0;
      const d = demand[c] ?? 0;
      const pc = result.perCountry[c];
      const imports = pc?.imports ?? 0;
      const exports = pc?.exports ?? 0;
      books.get(c)!.set(commodity, {
        supply: s,
        demand: reachableDemandUnits(d, imports, exports),
      });
    }
  }

  return books;
}

/**
 * Overlay the price turn's persisted REACHABLE books onto the corporate
 * clearing books, per country and commodity.
 *
 * `buildCountryClearingBooks` must run over PRE-trade national balances (see
 * `BuildReachableBooksArgs.balances`). The corporation turn only has stored
 * `nationalSupply`/`nationalDemand`, which are written after
 * `applyTradeConvergence`. Re-clearing those applies trade a second time and
 * halves an exporter's book demand. The price turn persists correct pre-trade
 * books in `tradeFlowSnapshots.books`; use them wherever they exist.
 */
export function overlayReachableClearingBooks(
  books: CountryClearingBooks,
  reachable:
    | Partial<Record<string, Partial<Record<CommodityType, { supply?: number; demand?: number }>>>>
    | null
    | undefined
): void {
  if (!reachable) return;
  for (const [countryId, byCommodity] of Object.entries(reachable)) {
    const target = books.get(countryId as CountryId);
    if (!target || !byCommodity) continue;
    for (const [commodity, entry] of Object.entries(byCommodity) as Array<
      [CommodityType, { supply?: number; demand?: number } | undefined]
    >) {
      const supply = entry?.supply;
      const demand = entry?.demand;
      if (!Number.isFinite(supply) || !Number.isFinite(demand)) continue;
      target.set(commodity, { supply: Math.max(0, supply!), demand: Math.max(0, demand!) });
    }
  }
}
