import { describe, expect, it } from "vitest";
import {
  advanceMacroGrowth,
  effectiveAnnualGrowth,
  growthFactorForTurns,
  MIN_ANNUAL_GROWTH,
} from "./growth";

const sectors = {
  manufacturing: { capacity: 1_000, productivity: 1.1, domesticDemand: 850 },
  retail: { capacity: 500, productivity: 1, domesticDemand: 525 },
};

describe("macro growth", () => {
  it("compounds to exactly the annual rate over one game year of ticks", () => {
    let factor = 1;
    for (let tick = 0; tick < 8; tick++) factor *= growthFactorForTurns(0.03, 6, 48);
    expect(factor).toBeCloseTo(1.03, 10);
    // Not the annual rate per turn.
    expect(growthFactorForTurns(0.03, 6, 48)).toBeLessThan(1.03);
  });

  it("lets a shock drag growth and bounds the result", () => {
    expect(effectiveAnnualGrowth(0.02, 1)).toBe(0.02);
    expect(effectiveAnnualGrowth(0.02, 0.8)).toBeCloseTo(-0.08, 10);
    // A favourable modifier does not raise growth above trend.
    expect(effectiveAnnualGrowth(0.02, 1.2)).toBe(0.02);
    expect(effectiveAnnualGrowth(0.02, 0.1)).toBe(MIN_ANNUAL_GROWTH);
  });

  it("grows capacity and demand together for the turns elapsed", () => {
    const grown = advanceMacroGrowth({
      sectors,
      trendGrowth: 0.02,
      shockModifier: 1,
      lastTickTurn: 1,
      turn: 49,
      turnsPerYear: 48,
    });
    expect(grown?.manufacturing).toEqual({
      capacity: 1_020,
      productivity: 1.1,
      domesticDemand: 867,
    });
    expect(grown?.retail?.capacity).toBe(510);
  });

  it("leaves documents without a trend, or without a prior tick, alone", () => {
    const base = { sectors, shockModifier: 1, turn: 49, turnsPerYear: 48 };
    expect(advanceMacroGrowth({ ...base, trendGrowth: undefined, lastTickTurn: 1 })).toBeNull();
    expect(advanceMacroGrowth({ ...base, trendGrowth: 0.02, lastTickTurn: null })).toBeNull();
    expect(advanceMacroGrowth({ ...base, trendGrowth: 0.02, lastTickTurn: 49 })).toBeNull();
  });
});
