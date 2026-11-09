import { describe, expect, it } from "vitest";
import {
  LABOUR_WAGE_DEFAULTS,
  LABOUR_WAGE_GROWTH,
  labourLinkedWageShareTarget,
  labourWageGrowth,
  labourWageShareTarget,
  lastWageShare,
  stateWageMove,
  stickyWageShareTarget,
  wageShareLabourCost,
  type WageShareReceipt,
} from "./wageShareRules";

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

// Explicit settings so the expectations do not move with the tuned defaults.
const p = { ...LABOUR_WAGE_DEFAULTS, maxShare: 0.65, floorShare: 0.3 };

describe("labour-linked wage share target", () => {
  it("sits at the maximum in a tight market and the floor in a slack one", () => {
    expect(labourWageShareTarget(3, p, 0.6)).toBe(0.65);
    expect(labourWageShareTarget(4.5, p, 0.6)).toBe(0.65);
    expect(labourWageShareTarget(12, p, 0.6)).toBeCloseTo(0.3, 12);
    expect(labourWageShareTarget(25, p, 0.6)).toBeCloseTo(0.3, 12);
  });

  it("falls in a straight line in between", () => {
    // Halfway from 4.5 to 12 is 8.25: halfway from 0.65 to 0.3.
    expect(labourWageShareTarget(8.25, p, 0.6)).toBeCloseTo(0.475, 12);
    const a = labourWageShareTarget(6, p, 0.6);
    const b = labourWageShareTarget(9, p, 0.6);
    expect(a).toBeGreaterThan(b);
  });

  it("uses the fallback with no unemployment reading", () => {
    expect(labourWageShareTarget(undefined, p, 0.6)).toBe(0.6);
    expect(labourWageShareTarget(Number.NaN, p, 0.6)).toBe(0.6);
  });

  it("reads last turn's paid wage share of value added", () => {
    expect(lastWageShare({ ...last, labourPaid: 100, labourArrears: 20 })).toBeCloseTo(0.12, 12);
    expect(lastWageShare(null)).toBeNull();
    expect(lastWageShare({ ...last, revenue: 400 })).toBeNull();
  });

  it("moves the effective target at most one step a turn either way", () => {
    expect(stickyWageShareTarget(0.65, 0.12, 0.03)).toBeCloseTo(0.15, 12);
    expect(stickyWageShareTarget(0.3, 0.6, 0.03)).toBeCloseTo(0.57, 12);
    expect(stickyWageShareTarget(0.5, 0.49, 0.03)).toBe(0.5);
    expect(stickyWageShareTarget(0.65, null, 0.03)).toBe(0.65);
    expect(stickyWageShareTarget(0.65, 0.12, 0)).toBe(0.65);
  });

  it("walks a plant's wage bill toward the state target over turns", () => {
    // Last turn paid 0.12 of value added; tight market: 0.15 this turn, not 0.65.
    const target = labourLinkedWageShareTarget({
      unemploymentRate: 3,
      last: { ...last, labourPaid: 120 },
      params: p,
      fallback: 0.6,
    });
    expect(target).toBeCloseTo(0.15, 12);
    // Base 1 a unit, value added 10 a unit: 1.5 a unit on 100 units.
    expect(wageShareLabourCost({ ...input, targetShare: target })).toBeCloseTo(150, 9);
  });
});

describe("labour market wage growth", () => {
  const atRest = { labour: 475, valueAdded: 1000, siteBill: 100 };

  it("is the neutral rate at the natural rate with wages at rest", () => {
    // Unemployment 8.25 sets the target to 0.475, which this plant already pays.
    expect(stateWageMove([atRest], 0.475, p.step, 0.75)).toBeCloseTo(0, 12);
    const g = labourWageGrowth({
      states: [{ unemploymentRate: 4.5, gdp: 1, plants: [] }],
      params: p,
      fallbackTarget: 0.6,
      surplusCap: 0.75,
      previous: null,
      turnsPerYear: 48,
    });
    expect(g).toBe(LABOUR_WAGE_GROWTH.neutral);
  });

  it("rises with tightness and falls with slack, weighted by GDP", () => {
    const run = (u: number[], gdp: number[]) =>
      labourWageGrowth({
        states: u.map((x, i) => ({ unemploymentRate: x, gdp: gdp[i]!, plants: [] })),
        params: p,
        fallbackTarget: 0.6,
        surplusCap: 0.75,
        previous: null,
        turnsPerYear: 48,
      })!;
    expect(run([2.5], [1])).toBeCloseTo(3 + 0.3 * 2, 9);
    expect(run([10.5], [1])).toBeCloseTo(3 - 0.3 * 6, 9);
    expect(run([2.5, 10.5], [3, 1])).toBeCloseTo(3 + 0.75 * 0.6 - 0.25 * 1.8, 9);
  });

  it("adds a capped term while wages walk up, and limits the move by surplus", () => {
    const low = { labour: 120, valueAdded: 1000, siteBill: 100 };
    // 0.12 -> 0.15: the wage bill rises a quarter this turn.
    expect(stateWageMove([low], 0.65, p.step, 0.75)).toBeCloseTo(0.25, 12);
    // A plant with no surplus cannot raise.
    expect(stateWageMove([{ labour: 800, valueAdded: 1000, siteBill: 200 }], 0.95, 0.5, 0.75)).toBe(
      0
    );
    const g = labourWageGrowth({
      states: [{ unemploymentRate: 4.5, gdp: 1, plants: [low] }],
      params: p,
      fallbackTarget: 0.6,
      surplusCap: 0.75,
      previous: null,
      turnsPerYear: 48,
    });
    expect(g).toBe(LABOUR_WAGE_GROWTH.neutral + LABOUR_WAGE_GROWTH.moveCap);
  });

  it("does not read a plant paying its base wage on thin value added as a wage cut", () => {
    // Paying 0.9 of value added is above any target the labour stage can ask: base wage.
    const thin = { labour: 900, valueAdded: 1000, siteBill: 50 };
    expect(stateWageMove([thin], 0.3, p.step, 0.75, p.maxShare)).toBe(0);
    // A plant paying a raise in a slack market steps down.
    expect(
      stateWageMove(
        [{ labour: 600, valueAdded: 1000, siteBill: 50 }],
        0.3,
        p.step,
        0.75,
        p.maxShare
      )
    ).toBeCloseTo(-0.05, 12);
  });

  it("smooths against last turn's rate and stays inside its bounds", () => {
    const base = {
      states: [{ unemploymentRate: 4.5, gdp: 1, plants: [] }],
      params: p,
      fallbackTarget: 0.6,
      surplusCap: 0.75,
      turnsPerYear: 48,
    };
    expect(labourWageGrowth({ ...base, previous: 8 })).toBeCloseTo(0.6 * 8 + 0.4 * 3, 9);
    expect(labourWageGrowth({ ...base, previous: 400 })).toBe(LABOUR_WAGE_GROWTH.ceiling);
    expect(
      labourWageGrowth({
        ...base,
        states: [{ unemploymentRate: 60, gdp: 1, plants: [] }],
        previous: null,
      })
    ).toBe(LABOUR_WAGE_GROWTH.floor);
    expect(labourWageGrowth({ ...base, states: [], previous: 3 })).toBeNull();
  });
});
