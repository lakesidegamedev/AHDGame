import { describe, expect, it } from "vitest";
import {
  PLANT_BUILD_PRICE_SCALE,
  capacityPricePerUnit,
  computeBuildCost,
  revenuePerCapacityUnit,
  resolvePlantBuildPriceScale,
} from "@/lib/constants/capacityEconomy";

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
