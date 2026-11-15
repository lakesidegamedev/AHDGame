import { describe, expect, it } from "vitest";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import { impliedOutputUnits } from "@/lib/market/capital";
import { computeSectorImpliedUnits } from "@/lib/market/sectorImpliedUnits";

describe("computeSectorImpliedUnits", () => {
  it("matches impliedOutputUnits on the standard strategy when none is given", () => {
    const strategy = getStrategy("energy", "standard");
    const expected = impliedOutputUnits(50_000, strategy.supply, COMMODITY_BASE_PRICES, 1);
    expect(computeSectorImpliedUnits("energy", 50_000, null, 1)).toBeCloseTo(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it("returns 0 for non-positive or non-finite revenue", () => {
    expect(computeSectorImpliedUnits("energy", 0, null, 1)).toBe(0);
    expect(computeSectorImpliedUnits("energy", -100, null, 1)).toBe(0);
    expect(computeSectorImpliedUnits("energy", NaN, null, 1)).toBe(0);
  });

  it("differs across sector types with different supply mixes", () => {
    const energy = computeSectorImpliedUnits("energy", 100_000, null, 1);
    const manufacturing = computeSectorImpliedUnits("manufacturing", 100_000, null, 1);
    expect(energy).not.toBeCloseTo(manufacturing, 0);
  });

  it("uses the entertainment mix for the canonical media discriminator", () => {
    expect(computeSectorImpliedUnits("media", 50_000, null, 1, null, "entertainment")).toBeCloseTo(
      computeSectorImpliedUnits("media_entertainment", 50_000, null, 1)
    );
  });
});
