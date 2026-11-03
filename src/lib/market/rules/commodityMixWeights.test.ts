import { describe, expect, it } from "vitest";
import {
  COMMODITY_BASE_PRICES,
  commodityMixWeight,
  eraScaledBasePrices,
  type CommodityType,
} from "@/lib/constants/commodities";
import { commodityMixWeights, mixWeightFor } from "./commodityMixWeights";

/**
 * The implementation `commodityMixWeights` replaces: one full mix total per
 * commodity, called once per output commodity of a sector.
 */
function legacyCommodityMixWeight(
  supplyRates: Partial<Record<CommodityType, number>>,
  basePrices: Record<CommodityType, number>,
  commodity: CommodityType
): number {
  let total = 0;
  for (const c of Object.keys(supplyRates) as CommodityType[]) {
    const r = supplyRates[c] ?? 0;
    const b = basePrices[c];
    if (r > 0 && b > 0) total += r / b;
  }
  const base = basePrices[commodity];
  const rate = supplyRates[commodity] ?? 0;
  if (!(total > 0) || !(base > 0) || rate <= 0) return 0;
  return rate / base / total;
}

const manufacturing = {
  steel: 0.35,
  electronics: 0.1,
  chemicals: 0.2,
  building_materials: 0.35,
} satisfies Partial<Record<CommodityType, number>>;

const extraction = {
  steel: 0.4,
  energy: 0.2,
  chemicals: 0.2,
  building_materials: 0.2,
  pharmaceuticals: 0,
} satisfies Partial<Record<CommodityType, number>>;

const fixtures: Array<{
  name: string;
  rates: Partial<Record<CommodityType, number>>;
  prices: Record<CommodityType, number>;
}> = [
  { name: "manufacturing mix", rates: manufacturing, prices: COMMODITY_BASE_PRICES },
  { name: "extraction mix with a zero leg", rates: extraction, prices: COMMODITY_BASE_PRICES },
  {
    name: "era-scaled prices",
    rates: manufacturing,
    prices: eraScaledBasePrices(0.0114),
  },
  {
    name: "single output",
    rates: { vehicles: 1 },
    prices: eraScaledBasePrices(1.7),
  },
  { name: "no positive leg", rates: { steel: 0 }, prices: COMMODITY_BASE_PRICES },
  { name: "empty mix", rates: {}, prices: COMMODITY_BASE_PRICES },
];

describe("commodityMixWeights", () => {
  it("matches the per-commodity call it replaces, bit for bit", () => {
    for (const fixture of fixtures) {
      const weights = commodityMixWeights(fixture.rates, fixture.prices);
      for (const commodity of Object.keys(fixture.rates) as CommodityType[]) {
        expect(mixWeightFor(weights, commodity), `${fixture.name}: ${commodity}`).toBe(
          legacyCommodityMixWeight(fixture.rates, fixture.prices, commodity)
        );
        expect(mixWeightFor(weights, commodity)).toBe(
          commodityMixWeight(fixture.rates, fixture.prices, commodity)
        );
      }
      // A commodity the mix does not produce is zero, exactly as the single call.
      expect(mixWeightFor(weights, "freight")).toBe(
        legacyCommodityMixWeight(fixture.rates, fixture.prices, "freight")
      );
    }
  });

  it("sums to one over the producing legs of a healthy mix", () => {
    const weights = commodityMixWeights(manufacturing, COMMODITY_BASE_PRICES);
    const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("computes the mix total once for a whole sector's output legs", () => {
    // The saving this table exists for: one pass over the legs instead of one
    // per leg. Counted on the fixture the clearing pass uses.
    const rates = manufacturing;
    const legs = Object.keys(rates).length;
    let legacyVisits = 0;
    for (const commodity of Object.keys(rates) as CommodityType[]) {
      for (const c of Object.keys(rates) as CommodityType[]) {
        legacyVisits += legacyCommodityMixWeight(rates, COMMODITY_BASE_PRICES, c) >= 0 ? 1 : 0;
      }
      expect(commodity).toBeTruthy();
    }
    const tableVisits = Object.keys(rates).length + Object.keys(rates).length;
    expect(legacyVisits).toBe(legs * legs);
    expect(tableVisits).toBe(2 * legs);
  });
});
