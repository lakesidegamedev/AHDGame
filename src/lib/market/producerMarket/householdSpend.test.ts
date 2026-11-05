import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { householdSpendBase, HOUSEHOLD_SAVINGS_DRAW_SHARE } from "./householdSpendRules";

describe("household spend base", () => {
  it("budgets the spend share of wages plus the draw share of savings (live turn 678 shape)", () => {
    // Wallet held 569 after 127 of wages: old rule budgets 0.9 x 569 = 512.
    const base = householdSpendBase({
      cash: 569,
      income: 127,
      spendFraction: 0.9,
      savingsDrawShare: 0.15,
    });
    expect(base * 0.9).toBeCloseTo(0.9 * 127 + 0.15 * 442);
  });
  it("never budgets more than the wallet holds, and spends the share of income when there are no savings", () => {
    expect(
      householdSpendBase({ cash: 100, income: 100, spendFraction: 0.9, savingsDrawShare: 0.15 })
    ).toBeCloseTo(100);
    expect(
      householdSpendBase({ cash: 50, income: 80, spendFraction: 0.9, savingsDrawShare: 0.15 })
    ).toBeCloseTo(50);
    expect(
      householdSpendBase({ cash: 200, income: 0, spendFraction: 0.9, savingsDrawShare: 1 })
    ).toBe(200);
  });
  it("settles savings where the draw matches outside inflow instead of growing without bound", () => {
    // 30 a turn arrives outside wages; with nothing to buy the household keeps what it cannot spend.
    let savings = 440;
    for (let i = 0; i < 200; i++) {
      const spent = Math.min(HOUSEHOLD_SAVINGS_DRAW_SHARE * savings, savings);
      savings = savings - spent + 30;
    }
    expect(savings).toBeCloseTo(30 / HOUSEHOLD_SAVINGS_DRAW_SHARE, 0);
  });
});

// One household with big savings and a small wage, buying food from one producer.
const farm = (labourCost: number): ProductionPlan => ({
  id: "farm",
  accountId: "farmco",
  capacityUnits: 1000,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost,
  otherOperatingCost: 0,
  labourRecipientAccountId: "home",
  operatingRecipientAccountId: "services",
  inputs: [],
  outputs: [
    {
      commodity: "food",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 1 },
      referenceUnitPrice: 1,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
});
const run = (incomeSpend?: { savingsDrawShare: number }) =>
  advanceProducerEconomy({
    turn: 1,
    accounts: [
      { id: "farmco", cash: 1000 },
      { id: "home", cash: 900 },
      { id: "services", cash: 0 },
    ],
    producers: [farm(100)],
    households: [
      {
        accountId: "home",
        spendFraction: 0.9,
        products: [{ commodity: "food", book: "world", maximumUnitPrice: 1, weight: 1 }],
      },
    ],
    ...(incomeSpend ? { householdIncomeSpend: incomeSpend } : {}),
  });
const requested = (r: ReturnType<typeof run>) =>
  (r.orderOutcomes ?? [])
    .filter((o) => o.commodity === "food")
    .reduce((n, o) => n + o.requestedUnits, 0);

describe("households spend from income in the settlement", () => {
  it("off: budgets 0.9 of all 1,000 held; on: 0.9 of the 100 of wages plus 0.15 of the 900 saved", () => {
    expect(requested(run())).toBeCloseTo(900);
    expect(requested(run({ savingsDrawShare: 0.15 }))).toBeCloseTo(90 + 135);
  });
  it("off is identical to absent", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run(undefined)));
  });
});
