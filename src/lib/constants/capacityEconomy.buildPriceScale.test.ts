import { describe, expect, it } from "vitest";
import {
  PLANT_BUILD_PRICE_SCALE,
  capacityPricePerUnit,
  computeBuildCost,
  revenuePerCapacityUnit,
  resolvePlantBuildPriceScale,
} from "@/lib/constants/capacityEconomy";
import { foundingStarterUnits } from "@/lib/corporations/foundingPlant";
import { quoteFoundingEntry } from "@/lib/corporations/rules/marketEntry";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";

const base = {
  sectorType: "logistics" as const,
  units: 25,
  strategyId: null,
  year: 2027,
  eraUnitScale: 1,
};

describe("plant build price scale", () => {
  it("scales an ordinary modern-era build by the default", () => {
    const unscaled = computeBuildCost({ ...base, buildPriceScale: 1 }).totalAnchor;
    const scaled = computeBuildCost(base).totalAnchor;
    expect(scaled).toBeCloseTo(unscaled * PLANT_BUILD_PRICE_SCALE, 6);
  });

  it("honours a configured override and ignores invalid values", () => {
    const unscaled = computeBuildCost({ ...base, buildPriceScale: 1 }).totalAnchor;
    expect(computeBuildCost({ ...base, buildPriceScale: 0.5 }).totalAnchor).toBeCloseTo(
      unscaled * 0.5,
      6
    );
    expect(resolvePlantBuildPriceScale(0)).toBe(PLANT_BUILD_PRICE_SCALE);
    expect(resolvePlantBuildPriceScale(Number.NaN)).toBe(PLANT_BUILD_PRICE_SCALE);
    expect(resolvePlantBuildPriceScale(5)).toBe(1);
  });

  it("does not scale founding builds", () => {
    const founding = computeBuildCost({ ...base, founding: true }).totalAnchor;
    const foundingUnscaled = computeBuildCost({
      ...base,
      founding: true,
      buildPriceScale: 1,
    }).totalAnchor;
    expect(founding).toBe(foundingUnscaled);
  });

  it("does not scale the 1991 basis", () => {
    const input = { ...base, year: 1991, preset: "1991-default" };
    expect(computeBuildCost(input).totalAnchor).toBe(
      computeBuildCost({ ...input, buildPriceScale: 1 }).totalAnchor
    );
  });

  it("leaves list price per unit, which values existing capacity, unchanged", () => {
    const list = capacityPricePerUnit("logistics", 2027, 1, null);
    expect(computeBuildCost(base).unitPriceAnchor).toBe(list);
  });

  it("never prices an early-era plant below one day of output", () => {
    const rpu = revenuePerCapacityUnit("logistics", 1);
    const unscaled = computeBuildCost({ ...base, year: 1953, units: 10, buildPriceScale: 1 });
    const scaled = computeBuildCost({ ...base, year: 1953, units: 10 });
    expect(scaled.buildPriceScaleMultiplier).toBeCloseTo(1 / 3, 10);
    expect(scaled.totalAnchor).toBeCloseTo(unscaled.totalAnchor / 3, 6);
    expect(unscaled.unitPriceAnchor / 3).toBeCloseTo(rpu, 6);
  });
});

describe("2027 standard facility build cost", () => {
  it.each([
    { sectorType: "retail", basisScale: 0.25, expansion: 12_000, totalEntry: 18_500 },
    { sectorType: "financial", basisScale: 0.2, expansion: 9_600, totalEntry: 15_800 },
  ] as const)("prices both entry and expansion for $sectorType", (row) => {
    const { sectorType, basisScale, expansion, totalEntry } = row;
    const preset = "2027-default";
    const units = foundingStarterUnits(sectorType);
    const existingBasis = capacityPricePerUnit(sectorType, 2027, 1, "standard", preset);
    const additional = computeBuildCost({
      ...base,
      sectorType,
      strategyId: "standard",
      preset,
      units,
      primeRate: 5,
    });
    const founding = quoteFoundingEntry({
      sectorType,
      preset,
      eraUnitScale: 1,
      currentYear: 2027,
      techExpansionDiscount: 0,
      techGrowthCostMultiplier: 1,
      techDominanceShield: 0,
      nationalMarketSharePercent: 0,
      primeRate: 5,
      acumen: NEUTRAL_STAT,
      hostCostOfLivingIndex: 100,
    });
    expect(additional.unitPriceAnchor).toBeCloseTo(existingBasis * basisScale);
    expect(additional.totalAnchor).toBeCloseTo(expansion);
    expect(founding.baseCostAnchor).toBeCloseTo(totalEntry);
    expect(existingBasis).toBeCloseTo(sectorType === "retail" ? 4_500 : 60_000);
  });

  it.each([
    { sectorType: "retail", strategyId: "ecommerce", preset: "2027-default" },
    { sectorType: "financial", strategyId: "traditional_banking", preset: "2027-default" },
    { sectorType: "financial", strategyId: "fintech", preset: "2019-default" },
    { sectorType: "financial", strategyId: "toString", preset: "2027-default" },
    { sectorType: "retail", strategyId: "standard", preset: "2019-default" },
  ] as const)("uses the normal basis for $preset $sectorType $strategyId", (input) => {
    expect(computeBuildCost({ ...base, ...input }).unitPriceAnchor).toBeCloseTo(
      capacityPricePerUnit(
        input.sectorType,
        base.year,
        base.eraUnitScale,
        input.strategyId,
        input.preset
      )
    );
  });
});

it("quotes a 2027 fintech expansion at its own construction basis", () => {
  const input = {
    ...base,
    sectorType: "financial",
    strategyId: "fintech",
    preset: "2027-default",
    primeRate: 5,
    units: foundingStarterUnits("financial"),
  } as const;
  expect(computeBuildCost(input).totalAnchor).toBeCloseTo(7_200);
  expect(capacityPricePerUnit("financial", 2027, 1, "fintech", input.preset)).toBeCloseTo(40_000);
});
