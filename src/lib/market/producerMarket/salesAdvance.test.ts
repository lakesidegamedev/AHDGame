import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, producerRunBudget, type ProductionPlan } from "./production";
import {
  deferredBillFraction,
  expectedUnitRevenue,
  salesAdvanceAmount,
  salesFundedRunShare,
} from "./salesAdvanceRules";
import type { MarketAccount, ProducerOffer, PurchaseOrder } from "./rules";

// A mill: 10 units a turn from 10 ore, wages 20, site bill 10 of which 4 is
// cold upkeep. A full run costs 20 + 6 + 10 ore at 1 = 36 beyond the upkeep
// and sells for 10 x 8 = 80.
const mill = (changes: Partial<ProductionPlan> = {}): ProductionPlan => ({
  id: "mill",
  accountId: "corp",
  capacityUnits: 10,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 20,
  otherOperatingCost: 10,
  idleOperatingCost: 4,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [{ commodity: "ore", unitsPerOutput: 1, book: "world", maximumUnitPrice: 1 }],
  outputs: [
    {
      commodity: "steel",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 8 },
      referenceUnitPrice: 8,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
  ...changes,
});
const ore: ProducerOffer = {
  id: "ore",
  accountId: "supplier",
  commodity: "ore",
  book: "world",
  units: 100,
  unitPrice: 1,
};
const buyer = (units = 10): PurchaseOrder => ({
  id: "buyer",
  accountId: "buyers",
  commodity: "steel",
  book: "world",
  units,
  maximumUnitPrice: 8,
});
const accounts = (corp: number, buyers = 1000): MarketAccount[] => [
  { id: "corp", cash: corp },
  { id: "households", cash: 0 },
  { id: "services", cash: 0 },
  { id: "buyers", cash: buyers },
  { id: "supplier", cash: 0 },
];
const cashOf = (rows: readonly MarketAccount[], id: string) => rows.find((r) => r.id === id)!.cash;
const total = (rows: readonly MarketAccount[]) => rows.reduce((n, r) => n + r.cash, 0);
const owed = (claims: readonly { amount: number }[]) => claims.reduce((n, c) => n + c.amount, 0);

describe("sales advance rules", () => {
  it("expects revenue at last turn's realized price and sell-through", () => {
    // 6 of 8 offered sold for 48: 6 a unit offered.
    expect(
      expectedUnitRevenue(
        [{ commodity: "steel", unitsPerOutput: 2 }],
        [{ commodity: "steel", offeredUnits: 8, soldUnits: 6, revenue: 48 }]
      )
    ).toBe(12);
    // A line it no longer makes and a line with no prior sale add nothing.
    expect(
      expectedUnitRevenue(
        [
          { commodity: "steel", unitsPerOutput: 1 },
          { commodity: "oil", unitsPerOutput: 0 },
          { commodity: "gas", unitsPerOutput: 1 },
        ],
        [
          { commodity: "steel", offeredUnits: 10, soldUnits: 10, revenue: 50 },
          { commodity: "oil", offeredUnits: 10, soldUnits: 10, revenue: 500 },
        ]
      )
    ).toBe(5);
    expect(expectedUnitRevenue([{ commodity: "steel", unitsPerOutput: 1 }], undefined)).toBe(0);
  });

  it("runs a paying run in full on no cash and a losing one on its cash share", () => {
    expect(salesFundedRunShare({ free: 0, need: 36, expectedRevenue: 80 })).toBe(1);
    // Revenue 20 (x0.9 = 18) against a cost of 36: cash 9 covers half the gap.
    expect(salesFundedRunShare({ free: 9, need: 36, expectedRevenue: 20 })).toBeCloseTo(0.5);
    expect(salesFundedRunShare({ free: 0, need: 36, expectedRevenue: 0 })).toBe(0);
    expect(salesAdvanceAmount({ free: 10, need: 36, runShare: 1 })).toBe(26);
    expect(salesAdvanceAmount({ free: 50, need: 36, runShare: 1 })).toBe(0);
  });

  it("pays deferred bills from what the sales left, never more", () => {
    expect(deferredBillFraction(30, 20)).toBe(1);
    expect(deferredBillFraction(5, 20)).toBe(0.25);
    expect(deferredBillFraction(0, 20)).toBe(0);
    expect(deferredBillFraction(-3, 20)).toBe(0);
  });

  it("budgets cold upkeep as the fixed bill and the running site bill with the run", () => {
    const { fixedBills, variableNeed } = producerRunBudget([mill()]);
    expect(fixedBills.get("corp")).toBe(4);
    expect(variableNeed.get("corp")).toBe(36);
  });
});

describe("sales fund the run", () => {
  it("a company that spent its cash still runs a plant whose sales pay for it", () => {
    // Without a sales record the old rule holds: no cash, no run.
    const stopped = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4),
      producers: [mill()],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    expect(stopped.producers[0].producedUnits).toBe(0);

    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4),
      producers: [mill({ expectedUnitRevenue: 8 })],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    const plant = run.producers[0];
    expect(plant.producedUnits).toBeCloseTo(10);
    expect(plant.revenue).toBeCloseTo(80);
    expect(plant.purchases).toBeCloseTo(10);
    // The sales paid the whole run before close: nothing is owed.
    expect(plant.labourPaid).toBeCloseTo(20);
    expect(plant.otherOperatingPaid).toBeCloseTo(10);
    expect(owed(run.payables)).toBe(0);
    expect(plant.runCutBy).toBeUndefined();
    expect(cashOf(run.accounts, "corp")).toBeCloseTo(4 + 80 - 10 - 30);
    expect(cashOf(run.accounts, "supplier")).toBeCloseTo(10);
    expect(total(run.accounts)).toBeCloseTo(total(accounts(4)));
  });

  it("owes what weak sales could not pay as an ordinary payable, never closing below zero", () => {
    // Buyers can only afford 2 units: 16 of revenue against a run costing 40.
    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4, 16),
      producers: [mill({ expectedUnitRevenue: 8 })],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    const plant = run.producers[0];
    expect(plant.revenue).toBeCloseTo(16);
    for (const account of run.accounts) expect(account.cash).toBeGreaterThanOrEqual(0);
    expect(total(run.accounts)).toBeCloseTo(total(accounts(4, 16)));
    // Suppliers were paid in cash; the shortfall sits with wages and the site.
    expect(cashOf(run.accounts, "supplier")).toBeCloseTo(plant.purchases);
    const unpaid = plant.labourArrears + plant.otherOperatingArrears;
    expect(unpaid).toBeGreaterThan(0);
    expect(owed(run.payables)).toBeCloseTo(unpaid);
    expect(cashOf(run.accounts, "corp")).toBeCloseTo(0);
  });

  it("cuts the input line when sales do not even cover the inputs bought on it", () => {
    // Buyers can afford half a unit: 4 of revenue against 10 of ore.
    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4, 4),
      producers: [mill({ expectedUnitRevenue: 8 })],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    for (const account of run.accounts) expect(account.cash).toBeGreaterThanOrEqual(0);
    expect(total(run.accounts)).toBeCloseTo(total(accounts(4, 4)));
    const plant = run.producers[0];
    // Ore bought on the line is paid in cash; the plant ran smaller and owes
    // the wages its sales could not cover.
    expect(plant.producedUnits).toBeLessThan(10);
    expect(plant.runCutBy).toEqual(["inputs"]);
    expect(cashOf(run.accounts, "supplier")).toBeCloseTo(plant.purchases);
    expect(owed(run.payables)).toBeGreaterThan(0);
  });

  it("does not advance a run whose sales would not pay for it", () => {
    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4),
      producers: [mill({ expectedUnitRevenue: 1 })],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    expect(run.producers[0].producedUnits).toBe(0);
    expect(owed(run.payables)).toBe(0);
  });
});

describe("bills follow a cash-cut run", () => {
  it("bills wages and site running costs on the share cash funded, keeping cold upkeep", () => {
    // Cash 22: upkeep 4, then 18 of a 36 run, so half a run.
    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(22),
      producers: [mill()],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    const plant = run.producers[0];
    expect(plant.producedUnits).toBeCloseTo(5);
    expect(plant.labourPaid).toBeCloseTo(10);
    expect(plant.otherOperatingPaid).toBeCloseTo(4 + 6 * 0.5);
    expect(plant.labourArrears).toBeCloseTo(0);
    expect(plant.otherOperatingArrears).toBeCloseTo(0);
    expect(plant.runCutBy).toEqual(["cash"]);
  });

  it("owes only cold upkeep when cash cannot start the plant", () => {
    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(1),
      producers: [mill()],
      externalOffers: [ore],
      externalOrders: [buyer()],
    });
    const plant = run.producers[0];
    expect(plant.producedUnits).toBe(0);
    expect(plant.labourPaid + plant.labourArrears).toBeCloseTo(0);
    expect(plant.otherOperatingPaid + plant.otherOperatingArrears).toBeCloseTo(4);
    expect(plant.runCutBy).toEqual(["cash"]);
  });
});
