import { describe, expect, it } from "vitest";
import { wageShareLabourCost, type WageShareReceipt } from "./wageShareRules";

// Last turn: 100 units, value added 1000 (10 a unit), site bill 100 (1 a unit).
const last: WageShareReceipt = {
  producedUnits: 100,
  soldUnits: 100,
  revenue: 1500,
  inputsConsumed: 500,
  inventoryWriteOff: 0,
  otherOperatingPaid: 100,
  otherOperatingArrears: 0,
};
// This turn: base wage 1 a unit on a 100-unit run.
const input = { baseLabourCost: 100, fullRunUnits: 100, last, targetShare: 0.6, surplusCap: 0.75 };

describe("wage share labour cost", () => {
  it("pays the base wage when the stage is off", () => {
    expect(wageShareLabourCost({ ...input, targetShare: 0 })).toBe(100);
    expect(wageShareLabourCost({ ...input, surplusCap: 0 })).toBe(100);
  });

  it("pays the base wage with no settled run to read", () => {
    expect(wageShareLabourCost({ ...input, last: null })).toBe(100);
    expect(wageShareLabourCost({ ...input, last: { ...last, producedUnits: 0 } })).toBe(100);
  });

  it("raises wages to the target share of value added when the surplus allows", () => {
    // target 6 a unit; surplus cap 0.75 * (10 - 1 - 1) = 6; raise 5 a unit.
    expect(wageShareLabourCost(input)).toBeCloseTo(600, 9);
  });

  it("takes at most the capped share of the surplus after base wages and site bills", () => {
    // target 0.9 * 10 = 9 a unit, cap 0.5 * 8 = 4: raise 4 a unit.
    expect(wageShareLabourCost({ ...input, targetShare: 0.9, surplusCap: 0.5 })).toBeCloseTo(
      500,
      9
    );
  });

  it("never cuts wages below the base, even for a plant above the target or at a loss", () => {
    expect(wageShareLabourCost({ ...input, baseLabourCost: 800 })).toBe(800);
    const loss = { ...last, revenue: 550 };
    expect(wageShareLabourCost({ ...input, last: loss })).toBe(100);
  });

  it("pays the raise on this turn's run", () => {
    expect(wageShareLabourCost({ ...input, baseLabourCost: 50, fullRunUnits: 50 })).toBeCloseTo(
      300,
      9
    );
  });

  it("does not read a thin run that sold old stock as a rich one", () => {
    const stock = { ...last, producedUnits: 10, soldUnits: 100 };
    expect(wageShareLabourCost({ ...input, last: stock })).toBeLessThan(
      wageShareLabourCost({ ...input, last: { ...stock, soldUnits: 10 } })
    );
  });

  it("leaves a plant a surplus on last turn's numbers for any setting", () => {
    for (const targetShare of [0.3, 0.6, 1])
      for (const surplusCap of [0.25, 0.75, 1]) {
        const wage = wageShareLabourCost({ ...input, targetShare, surplusCap });
        expect(1000 - 100 - wage).toBeGreaterThanOrEqual(-1e-9);
      }
  });
});
