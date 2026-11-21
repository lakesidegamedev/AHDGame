import { describe, expect, it } from "vitest";
import {
  SECTOR_STRATEGIES,
  getEffectiveStrategyRates,
  getSectorStrategies,
  getStrategy,
} from "./sectorStrategies";

const demandRate = (sector: keyof typeof SECTOR_STRATEGIES, strategy: string) =>
  Object.values(getStrategy(sector, strategy, "1991-default").demand).reduce(
    (sum, rate) => sum + (rate ?? 0),
    0
  );

describe("input-heavy strategy fairness", () => {
  it.each([
    ["manufacturing", "standard", 0.615],
    ["manufacturing", "heavy_metals", 0.614],
    ["healthcare", "biotech", 0.547],
    ["defense", "heavy_armor", 0.384],
    ["logistics", "standard", 0.468],
    ["construction", "standard", 0.5],
    ["construction", "infrastructure", 0.526],
    ["retail", "standard", 0.58],
  ] as const)("keeps %s/%s input rates at the audited ceiling", (sector, strategy, expected) => {
    expect(demandRate(sector, strategy)).toBeCloseTo(expected, 10);
  });

  it.each([
    ["standard", 0.315],
    ["brick_mortar", 0.4],
    ["ecommerce", 0.35],
    ["ecommerce_fulfillment", 0.38],
  ] as const)("keeps modern retail/%s input rates at the audited ceiling", (strategy, expected) => {
    const sum = Object.values(getStrategy("retail", strategy, "2027-default").demand).reduce(
      (total, rate) => total + (rate ?? 0),
      0
    );
    expect(sum).toBeCloseTo(expected, 10);
  });

  it.each([false, true])(
    "scales only 2027 Standard retail inputs with advertising=%s",
    (advertisingInput) => {
      const options = { advertisingInput };
      const prior = getStrategy("retail", "standard", "2019-default", options);
      const modern = getStrategy("retail", "standard", "2027-default", options);
      expect(modern.supply).toEqual(prior.supply);
      expect(Object.keys(modern.demand)).toEqual(Object.keys(prior.demand));
      for (const [commodity, rate] of Object.entries(prior.demand)) {
        expect(modern.demand[commodity as keyof typeof modern.demand]).toBeCloseTo(rate * 0.7, 10);
      }
      expect(
        getEffectiveStrategyRates(
          "retail",
          "standard",
          null,
          null,
          43,
          "2027-default",
          null,
          options
        ).demand
      ).toEqual(modern.demand);
      if (!advertisingInput) {
        expect(
          getSectorStrategies("retail", false, "2027-default").find((s) => s.id === "standard")
            ?.demand
        ).toEqual(modern.demand);
      }
    }
  );

  it("does not change already-healthy benchmark recipes", () => {
    expect(demandRate("technology", "software")).toBeCloseTo(0.25, 10);
    expect(demandRate("financial", "standard")).toBeCloseTo(0.34, 10);
    expect(demandRate("extraction", "standard")).toBeCloseTo(0.56, 10);
  });
});
