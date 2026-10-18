import { describe, expect, it } from "vitest";
import {
  expansionShare,
  INVESTMENT_HURDLE,
  INVESTMENT_MAX_SHARE,
  INVESTMENT_PAYBACK_TURNS,
  marginalUnitMargin,
} from "./investmentRules";

const plant = (over: Partial<Parameters<typeof expansionShare>[0]> = {}) => ({
  activeUnits: 100,
  producedUnits: 100,
  offeredUnits: 100,
  soldUnits: 100,
  referenceUnitPrice: 10,
  unitOperatingCost: 6,
  unitBuildCost: 240,
  ...over,
});

describe("investment on expected settled margin", () => {
  it("counts build cost spread over the payback horizon", () => {
    expect(marginalUnitMargin(plant())).toBeCloseTo(
      (10 - 6 - 240 / INVESTMENT_PAYBACK_TURNS) / 10,
      12
    );
  });
  it("a sold-out, full-running plant with a healthy margin builds, capped per turn", () => {
    expect(expansionShare(plant())).toBe(INVESTMENT_MAX_SHARE);
  });
  it("never builds without unserved demand or while not capacity-bound", () => {
    expect(expansionShare(plant({ soldUnits: 80 }))).toBe(0);
    expect(expansionShare(plant({ producedUnits: 60, offeredUnits: 60, soldUnits: 60 }))).toBe(0);
  });
  it("never builds below the hurdle and scales up from it", () => {
    const atHurdle = 10 * (1 - INVESTMENT_HURDLE) - 1;
    expect(expansionShare(plant({ unitOperatingCost: atHurdle }))).toBe(0);
    const mid = expansionShare(
      plant({ unitOperatingCost: 10 * (1 - 1.5 * INVESTMENT_HURDLE) - 1 })
    );
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(INVESTMENT_MAX_SHARE);
  });
  it("a high price from a shortage that sells out still has to pay for the build", () => {
    expect(expansionShare(plant({ referenceUnitPrice: 10, unitBuildCost: 2400 }))).toBe(0);
  });
});
