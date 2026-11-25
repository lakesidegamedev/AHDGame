import { describe, expect, it } from "vitest";
import {
  averageWageMultiplier,
  householdSpendingPowerOn,
  spendingPowerRamp,
  spendingPowerTarget,
  spendingPowerTopUps,
  wageFactor,
  HOUSEHOLD_SPENDING_POWER_SHARE,
} from "./householdSpendingPowerRules";

describe("householdSpendingPowerOn", () => {
  it("is on when absent and off at 0", () => {
    expect(householdSpendingPowerOn({})).toBe(true);
    expect(householdSpendingPowerOn({ householdSpendingPowerStage: 1 })).toBe(true);
    expect(householdSpendingPowerOn({ householdSpendingPowerStage: 0 })).toBe(false);
  });
});

describe("wageFactor", () => {
  it("is 1 with no staffed plants", () => {
    expect(wageFactor({ plants: [], population: 1e6 })).toBe(1);
    expect(
      wageFactor({ plants: [{ stateId: "S", workers: 0, wageMultiplier: 2 }], population: 1e6 })
    ).toBe(1);
  });

  it("weights plants by workers", () => {
    const avg = averageWageMultiplier([
      { stateId: "S", workers: 100, wageMultiplier: 1 },
      { stateId: "S", workers: 300, wageMultiplier: 2 },
    ]);
    expect(avg?.mean).toBeCloseTo(1.75, 9);
    expect(avg?.workers).toBe(400);
  });

  it("scales the plant effect by their share of the labour force", () => {
    // 400 workers in a 0.6 x 10000 = 6000 labour force: influence 400/6000 x 10.
    const f = wageFactor({
      plants: [{ stateId: "S", workers: 400, wageMultiplier: 1.5 }],
      population: 10000,
    });
    expect(f).toBeCloseTo(1 + (4000 / 6000) * 0.5, 9);
  });

  it("caps influence at 1 and prefers the working-age count", () => {
    const f = wageFactor({
      plants: [{ stateId: "S", workers: 5000, wageMultiplier: 0.8 }],
      population: 10000,
      workingAgePopulation: 6000,
    });
    expect(f).toBeCloseTo(0.8, 9);
  });
});

describe("spendingPowerTarget and ramp", () => {
  it("is share x population x median income x factor / 48", () => {
    expect(
      spendingPowerTarget({ population: 1e6, medianIncomeAnchor: 30000, wageFactor: 1.1 })
    ).toBeCloseTo((HOUSEHOLD_SPENDING_POWER_SHARE * 1e6 * 30000 * 1.1) / 48, 9);
  });

  it("is zero without people or income", () => {
    expect(spendingPowerTarget({ population: 0, medianIncomeAnchor: 1, wageFactor: 1 })).toBe(0);
    expect(spendingPowerTarget({ population: 1, medianIncomeAnchor: 0, wageFactor: 1 })).toBe(0);
  });

  it("ramps from 0 to 1 over the ramp turns", () => {
    expect(spendingPowerRamp({ turn: 10, startTurn: 10 })).toBe(0);
    expect(spendingPowerRamp({ turn: 46, startTurn: 10 })).toBeCloseTo(0.5, 9);
    expect(spendingPowerRamp({ turn: 500, startTurn: 10 })).toBe(1);
    expect(spendingPowerRamp({ turn: 5, startTurn: 10 })).toBe(0);
    expect(spendingPowerRamp({ turn: 20, startTurn: 10, rampTurns: 10 })).toBe(1);
  });
});

describe("spendingPowerTopUps", () => {
  const base = {
    wallets: [
      { accountId: "w1", stateId: "S1", countryId: "C" },
      { accountId: "w2", stateId: "S2", countryId: "C" },
    ],
    stateById: new Map([
      ["S1", { population: 1e6, medianIncomeLocal: 60000 }],
      ["S2", { population: 1e6, medianIncomeLocal: 60000 }],
    ]),
    localPerAnchorByCountry: new Map([["C", 2]]),
    plantsByState: new Map(),
    turn: 100,
    startTurn: 28,
  };
  const target = spendingPowerTarget({
    population: 1e6,
    medianIncomeAnchor: 30000,
    wageFactor: 1,
  });

  it("tops up the gap between target and income, times the ramp", () => {
    const rows = spendingPowerTopUps({
      ...base,
      incomeByWallet: new Map([["w1", target / 4]]),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.amount).toBeCloseTo(target * 0.75, 6);
    expect(rows[1]!.amount).toBeCloseTo(target, 6);
  });

  it("stops topping up a wallet that already holds three turns of its target", () => {
    const rows = spendingPowerTopUps({
      ...base,
      incomeByWallet: new Map(),
      cashByWallet: new Map([
        ["w1", target * 3],
        ["w2", target * 2.5],
      ]),
    });
    // w1 is full; w2 has room for half a turn of target only.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.walletId).toBe("w2");
    expect(rows[0]!.amount).toBeCloseTo(target * 0.5, 6);
  });

  it("pays nothing once income already meets the target", () => {
    const rows = spendingPowerTopUps({
      ...base,
      incomeByWallet: new Map([
        ["w1", target * 2],
        ["w2", target],
      ]),
    });
    expect(rows).toHaveLength(0);
  });

  it("pays nothing before the ramp starts", () => {
    expect(
      spendingPowerTopUps({ ...base, startTurn: 100, incomeByWallet: new Map() })
    ).toHaveLength(0);
  });

  it("skips wallets without a state, rate or income figure", () => {
    const rows = spendingPowerTopUps({
      ...base,
      stateById: new Map([["S1", { population: 1e6, medianIncomeLocal: undefined }]]),
      incomeByWallet: new Map(),
    });
    expect(rows).toHaveLength(0);
  });
});
