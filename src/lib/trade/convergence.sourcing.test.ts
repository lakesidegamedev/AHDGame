import { describe, it, expect } from "vitest";
import { applyTradeConvergence, capClearingToSourcedTrade } from "./convergence";
import { buildReachableBooks } from "./reachableBook";
import { clearAllCommodities, type ByCountryBalances } from "./snapshot";
import { getBaseAffinity } from "./affinity";
import type { CommodityType } from "@/lib/constants/commodities";
import type { CountryId } from "@/lib/constants/countries";

function byCountryOf(
  rows: Array<[CountryId, Partial<Record<CommodityType, [number, number]>>]>
): ByCountryBalances {
  const m: ByCountryBalances = new Map();
  for (const [country, bals] of rows) {
    const inner = new Map<CommodityType, { supply: number; demand: number }>();
    for (const [c, [supply, demand]] of Object.entries(bals) as Array<
      [CommodityType, [number, number]]
    >) {
      inner.set(c, { supply, demand });
    }
    m.set(country, inner);
  }
  return m;
}

const countries: CountryId[] = ["IE", "UK"];
const affinityFor = (_c: CommodityType, e: CountryId, i: CountryId) => getBaseAffinity(e, i);

function pair(
  commodity: CommodityType,
  exporter: CountryId,
  importer: CountryId,
  dispatchedUnits: number,
  deliveredUnits = dispatchedUnits
) {
  return { commodity, exporter, importer, dispatchedUnits, deliveredUnits };
}

/** Run clearing then convergence (k=1) exactly as the price turn does. */
function converge(
  rows: Array<[CountryId, Partial<Record<CommodityType, [number, number]>>]>,
  sourcing: Parameters<typeof capClearingToSourcedTrade>[1]
) {
  const byCountry = byCountryOf(rows);
  const clearing = clearAllCommodities(countries, byCountry, affinityFor);
  const shipped = capClearingToSourcedTrade(clearing, sourcing);
  applyTradeConvergence(countries, byCountry, shipped, 1);
  return { byCountry, clearing, shipped };
}

describe("capClearingToSourcedTrade", () => {
  it("leaves an exporter's supply unreduced when sourcing shipped none of its surplus abroad", () => {
    // Clearing credits IE with 100 food exported; sourcing placed none abroad.
    const { byCountry, clearing } = converge(
      [
        ["IE", { food: [200, 100] }],
        ["UK", { food: [0, 100] }],
      ],
      { summaries: [{ commodity: "food" }], pairAggregates: [] }
    );
    expect(clearing.get("food")!.perCountry.IE.exports).toBeCloseTo(100);
    const ie = byCountry.get("IE")!.get("food")!;
    expect(ie.supply).toBe(200);
    // Supply over demand stays above 1, so the national price can fall.
    expect(ie.supply / ie.demand).toBeGreaterThan(1);
    // Nothing arrived in the UK either, so its shortage is not relieved.
    expect(byCountry.get("UK")!.get("food")!.demand).toBe(100);
  });

  it("keeps the persisted clearing result untouched and books only shipped trade", () => {
    const byCountry = byCountryOf([
      ["IE", { food: [200, 100] }],
      ["UK", { food: [0, 100] }],
    ]);
    const clearing = clearAllCommodities(countries, byCountry, affinityFor);
    const shipped = capClearingToSourcedTrade(clearing, {
      summaries: [{ commodity: "food" }],
      pairAggregates: [pair("food", "IE", "UK", 40, 30)],
    });
    // Exporter is capped by what left (dispatched), importer by what arrived.
    expect(shipped.get("food")!.perCountry.IE).toMatchObject({ exports: 40, imports: 0, net: 40 });
    expect(shipped.get("food")!.perCountry.IE.uncleared).toBeCloseTo(60);
    expect(shipped.get("food")!.perCountry.UK).toMatchObject({ exports: 0, imports: 30, net: -30 });
    expect(shipped.get("food")!.perCountry.UK.uncleared).toBeCloseTo(-70);
    expect(clearing.get("food")!.perCountry.IE.exports).toBeCloseTo(100);

    const books = buildReachableBooks({
      countries,
      balances: byCountry,
      clearing: shipped,
      commodities: ["food"],
      affinity: affinityFor,
    });
    // Book demand = domestic demand - imports + exports, on shipped units.
    expect(books.get("IE")!.get("food")).toMatchObject({ exports: 40, demand: 140 });
    expect(books.get("UK")!.get("food")).toMatchObject({ imports: 30, demand: 70 });

    applyTradeConvergence(countries, byCountry, shipped, 1);
    expect(byCountry.get("IE")!.get("food")!.supply).toBeCloseTo(160);
    expect(byCountry.get("UK")!.get("food")!.demand).toBeCloseTo(70);
  });

  it("matches current behaviour when sourcing shipped at least the cleared volume", () => {
    const rows: Array<[CountryId, Partial<Record<CommodityType, [number, number]>>]> = [
      ["IE", { food: [200, 100] }],
      ["UK", { food: [0, 100] }],
    ];
    const current = byCountryOf(rows);
    applyTradeConvergence(
      countries,
      current,
      clearAllCommodities(countries, current, affinityFor),
      1
    );
    const { byCountry, clearing, shipped } = converge(rows, {
      summaries: [{ commodity: "food" }],
      pairAggregates: [pair("food", "IE", "UK", 150)],
    });
    expect(shipped.get("food")!.perCountry).toEqual(clearing.get("food")!.perCountry);
    expect(byCountry).toEqual(current);
  });

  it("falls back to the clearing result exactly when sourcing data is missing", () => {
    const byCountry = byCountryOf([
      ["IE", { food: [200, 100] }],
      ["UK", { food: [0, 100] }],
    ]);
    const clearing = clearAllCommodities(countries, byCountry, affinityFor);
    expect(capClearingToSourcedTrade(clearing, null)).toBe(clearing);
    expect(capClearingToSourcedTrade(clearing, undefined)).toBe(clearing);
  });

  it("does not cap a commodity the sourcing pass did not settle", () => {
    const { byCountry, clearing, shipped } = converge(
      [
        ["IE", { steel: [200, 100] }],
        ["UK", { steel: [0, 100] }],
      ],
      { summaries: [{ commodity: "food" }], pairAggregates: [] }
    );
    expect(shipped.get("steel")).toBe(clearing.get("steel"));
    expect(byCountry.get("IE")!.get("steel")!.supply).toBeCloseTo(100);
  });

  it("caps non-food commodities too (fertilizers)", () => {
    const { byCountry } = converge(
      [
        ["IE", { fertilizers: [300, 100] }],
        ["UK", { fertilizers: [0, 200] }],
      ],
      {
        summaries: [{ commodity: "food" }, { commodity: "fertilizers" }],
        // Same-country haulage is not an export and must be ignored.
        pairAggregates: [pair("fertilizers", "IE", "IE", 500), pair("fertilizers", "IE", "UK", 50)],
      }
    );
    expect(byCountry.get("IE")!.get("fertilizers")!.supply).toBeCloseTo(250);
    expect(byCountry.get("UK")!.get("fertilizers")!.demand).toBeCloseTo(150);
  });

  it("is still a no-op at k=0", () => {
    const byCountry = byCountryOf([
      ["IE", { food: [200, 100] }],
      ["UK", { food: [0, 100] }],
    ]);
    const shipped = capClearingToSourcedTrade(
      clearAllCommodities(countries, byCountry, affinityFor),
      { summaries: [{ commodity: "food" }], pairAggregates: [pair("food", "IE", "UK", 40)] }
    );
    applyTradeConvergence(countries, byCountry, shipped, 0);
    expect(byCountry.get("IE")!.get("food")).toEqual({ supply: 200, demand: 100 });
    expect(byCountry.get("UK")!.get("food")).toEqual({ supply: 0, demand: 100 });
  });
});
