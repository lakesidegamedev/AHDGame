import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, producerRunBudget, type ProductionPlan } from "./production";
import {
  deferredBillFraction,
  expectedInputUnitPrice,
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

// gameConfig.producerSalesAdvancePriceStage: judge the run on expected input
// prices, not the bid ceiling.
describe("sales advance on expected input prices", () => {
  it("prices an input at last turn's clearing price, never above the ceiling", () => {
    expect(expectedInputUnitPrice(6, 1)).toBe(1);
    expect(expectedInputUnitPrice(6, 9)).toBe(6);
    expect(expectedInputUnitPrice(6, undefined)).toBe(6);
    expect(expectedInputUnitPrice(6, 0)).toBe(6);
    expect(expectedInputUnitPrice(6, Number.NaN)).toBe(6);
  });

  it("restores the run of a company that spent its cash on construction (turn 663 case)", () => {
    // The company's real opening at turn 663: 2.11M free after fixed bills of
    // 2,252; a full run needs 26.48M with inputs at the bid ceiling but 8.99M
    // at last turn's clearing prices (wages 2.34M, site 0.41M, inputs 6.24M);
    // a full run is expected to earn 8.96M.
    const free = 2_113_867;
    const need = 26_481_976;
    const expectedNeed = 2_335_382 + 413_699 + 6_242_850;
    const expectedRevenue = 8_959_814;
    // At the ceiling the run reads as losing money: held to an 11% run.
    const atCeiling = salesFundedRunShare({ free, need, expectedRevenue });
    expect(atCeiling).toBeCloseTo(0.1148, 3);
    expect(salesAdvanceAmount({ free, need, runShare: atCeiling })).toBeCloseTo(925_493, -1);
    // At expected prices the sales plus its cash cover the whole run.
    const share = salesFundedRunShare({ free, need, expectedRevenue, expectedNeed });
    expect(share).toBe(1);
    // The advance is capped by the run's expected revenue, not the ceiling gap.
    const amount = salesAdvanceAmount({ free, need, runShare: share, expectedRevenue });
    expect(amount).toBeCloseTo(expectedRevenue * 0.9, 0);
    expect(amount).toBeLessThan(need - free);
    // Cash and the advance together cover the run at expected prices.
    expect(free + amount).toBeGreaterThanOrEqual(expectedNeed);
  });

  it("still holds a run that loses money at market prices to the share cash covers", () => {
    // Expected cost 36, revenue 20 (x0.9 = 18): cash 9 covers half the gap.
    expect(
      salesFundedRunShare({ free: 9, need: 66, expectedNeed: 36, expectedRevenue: 20 })
    ).toBeCloseTo(0.5);
    // A clearing price above the ceiling never raises the judged cost.
    expect(salesFundedRunShare({ free: 0, need: 36, expectedNeed: 90, expectedRevenue: 80 })).toBe(
      1
    );
    expect(
      salesAdvanceAmount({ free: 9, need: 66, runShare: 0.5, expectedRevenue: 20 })
    ).toBeCloseTo(9);
  });

  // Ore's bid ceiling is 6 but it last cleared, and is offered, at 1. At the
  // ceiling the run costs 20 + 6 + 60 = 86 against 80 x 0.9 = 72 of sales; at
  // the market it costs 36.
  const dearCeiling = (changes: Partial<ProductionPlan> = {}) =>
    mill({
      expectedUnitRevenue: 8,
      inputs: [{ commodity: "ore", unitsPerOutput: 1, book: "world", maximumUnitPrice: 6 }],
      ...changes,
    });
  const settle = (salesAdvanceAtClearing?: boolean) =>
    advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4),
      producers: [dearCeiling()],
      externalOffers: [ore],
      externalOrders: [buyer()],
      clearingPriceByLane: { "ore|world": 1 },
      ...(salesAdvanceAtClearing != null ? { salesAdvanceAtClearing } : {}),
    });

  it("off: a run that pays at market prices is held to its cash by the bid ceiling", () => {
    const run = settle();
    expect(run.producers[0].producedUnits).toBe(0);
    expect(run.producers[0].runCutBy).toEqual(["cash"]);
    // Off and absent are the same settlement.
    expect(JSON.stringify(settle(false))).toBe(JSON.stringify(run));
  });

  it("on: the same run is financed by its sales and closes owing nothing", () => {
    const run = settle(true);
    const plant = run.producers[0];
    expect(plant.producedUnits).toBeCloseTo(10);
    expect(plant.revenue).toBeCloseTo(80);
    expect(plant.purchases).toBeCloseTo(10);
    expect(plant.runCutBy).toBeUndefined();
    expect(owed(run.payables)).toBe(0);
    expect(cashOf(run.accounts, "corp")).toBeCloseTo(4 + 80 - 10 - 30);
    for (const account of run.accounts) expect(account.cash).toBeGreaterThanOrEqual(0);
    expect(total(run.accounts)).toBeCloseTo(total(accounts(4)));
  });

  it("on: inputs dearer than the last clearing still never close a company below zero", () => {
    // Ore is now offered at the ceiling: the advance (capped at 72) runs out.
    const run = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(4),
      producers: [dearCeiling()],
      externalOffers: [{ ...ore, unitPrice: 6 }],
      externalOrders: [buyer()],
      clearingPriceByLane: { "ore|world": 1 },
      salesAdvanceAtClearing: true,
    });
    for (const account of run.accounts) expect(account.cash).toBeGreaterThanOrEqual(0);
    expect(total(run.accounts)).toBeCloseTo(total(accounts(4)));
    const plant = run.producers[0];
    expect(cashOf(run.accounts, "supplier")).toBeCloseTo(plant.purchases);
  });
});

describe("expected sales count own-site deliveries (ticket 1785)", () => {
  // Prod shape: a chemicals line offered 4633.6 units, sold 3111.7 at 829.5 and
  // delivered 1521.9 to the company's own sites at a captive 819.9. The
  // delivered units earn nothing in `revenue`, so reading it alone understates
  // what the run earns by about a third and the cut turn is not rescued.
  const line = {
    commodity: "chemicals",
    offeredUnits: 4633.6,
    soldUnits: 3111.7,
    revenue: 2_581_237.8,
    internalDeliveredUnits: 1521.9,
    captiveUnitValue: 819.93,
    realizedUnitPrice: 829.52,
  };
  const outputs = [{ commodity: "chemicals", unitsPerOutput: 1 }];

  it("pays the own-site units at their captive value", () => {
    const withInternal = expectedUnitRevenue(outputs, [line]);
    const marketOnly = expectedUnitRevenue(outputs, [{ ...line, internalDeliveredUnits: 0 }]);
    expect(marketOnly).toBeCloseTo(557.0, 0);
    expect(withInternal).toBeCloseTo(826.4, 0);
  });

  it("funds a break-even run in full once own-site sales are counted", () => {
    const need = 700_000;
    const revenueFor = (unit: number) => unit * 1000;
    const marketOnly = revenueFor(
      expectedUnitRevenue(outputs, [{ ...line, internalDeliveredUnits: 0 }])
    );
    const withInternal = revenueFor(expectedUnitRevenue(outputs, [line]));
    expect(salesFundedRunShare({ free: 0, need, expectedRevenue: marketOnly })).toBeLessThan(1);
    expect(salesFundedRunShare({ free: 0, need, expectedRevenue: withInternal })).toBe(1);
  });
});
