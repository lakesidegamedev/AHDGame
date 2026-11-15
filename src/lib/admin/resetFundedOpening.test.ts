import { describe, expect, it } from "vitest";
import { computeSectorImpliedUnits } from "@/lib/market/sectorImpliedUnits";
import { missingStatePrices, openingCapacityUnits } from "./resetFundedOpening";

describe("openingCapacityUnits", () => {
  it("converts host-currency revenue to the anchor before implying units", () => {
    const units = openingCapacityUnits({
      sectorType: "healthcare",
      revenueLocal: 1_000_000,
      localPerAnchor: 0.8,
      strategyId: null,
      eraUnitScale: 1,
    });
    expect(units).toBeCloseTo(computeSectorImpliedUnits("healthcare", 1_250_000, null, 1), 9);
  });

  it("treats a missing or broken rate as parity", () => {
    const parity = computeSectorImpliedUnits("healthcare", 500_000, null, 1);
    for (const rate of [0, -1, Number.NaN])
      expect(
        openingCapacityUnits({
          sectorType: "healthcare",
          revenueLocal: 500_000,
          localPerAnchor: rate,
          strategyId: null,
          eraUnitScale: 1,
        })
      ).toBeCloseTo(parity, 9);
  });

  it("skips non-operating sectors and unusable revenue", () => {
    const base = { revenueLocal: 1, localPerAnchor: 1, strategyId: null, eraUnitScale: 1 };
    expect(openingCapacityUnits({ ...base, sectorType: "not-a-sector" })).toBeNull();
    expect(
      openingCapacityUnits({ ...base, sectorType: "healthcare", revenueLocal: Number.NaN })
    ).toBeNull();
    expect(
      openingCapacityUnits({ ...base, sectorType: "healthcare", revenueLocal: -5 })
    ).toBeNull();
  });
});

describe("missingStatePrices", () => {
  it("fills only the missing states of a state-scoped commodity at its global price", () => {
    expect(
      missingStatePrices(
        { commodity: "healthcare_services", globalPrice: 2500, statePrices: { CA: 2600 } },
        ["CA", "NY", "TX"]
      )
    ).toEqual({ "statePrices.NY": 2500, "statePrices.TX": 2500 });
  });

  it("replaces non-positive state prices", () => {
    expect(
      missingStatePrices(
        { commodity: "construction_services", globalPrice: 10, statePrices: { CA: 0 } },
        ["CA"]
      )
    ).toEqual({ "statePrices.CA": 10 });
  });

  it("leaves world-traded commodities and missing global prices alone", () => {
    expect(missingStatePrices({ commodity: "steel", globalPrice: 5 }, ["CA"])).toEqual({});
    expect(missingStatePrices({ commodity: "healthcare_services" }, ["CA"])).toEqual({});
  });
});
