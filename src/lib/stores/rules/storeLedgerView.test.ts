import { describe, expect, it } from "vitest";
import { storeLedgerView } from "./storeLedgerView";

const receipt = {
  store: {
    goodsBoughtWholesale: 1000,
    markupEarned: 150,
    wholesaleByCommodity: { food: 600, electronics: 350, consumer_goods: 50 },
  },
  profit: 40,
  labourPaid: 45,
  otherOperatingPaid: 20,
  inputsConsumed: 45,
  producedUnits: 30,
  offeredUnits: 120,
};

describe("store ledger view", () => {
  it("adds up row by row, and the margin is the receipt's profit", () => {
    const view = storeLedgerView({ turn: 247, turnsPerDay: 12, receipt });
    const sum = (rows: { value: number }[]) => rows.reduce((n, r) => n + r.value, 0);
    // Goods by commodity add to goods bought wholesale.
    expect(sum(view.wholesaleByCommodity)).toBeCloseTo(view.goodsBoughtWholesale, 9);
    // Goods bought plus markup is what households paid.
    expect(view.goodsBoughtWholesale + view.markupEarned).toBeCloseTo(view.soldToHouseholds, 9);
    // The cost lines add to running costs.
    expect(sum(view.runningCostRows)).toBeCloseTo(view.runningCosts, 9);
    // Markup minus running costs is the margin, and the margin is the profit.
    expect(view.markupEarned - view.runningCosts).toBeCloseTo(view.margin, 9);
    expect(view.margin).toBeCloseTo(receipt.profit * 12, 9);
    // Nothing is left over in "other" when the bill is wages, site and supplies.
    expect(view.runningCostRows.find((r) => r.key === "other")!.value).toBeCloseTo(0, 9);
    expect(view.markupRate).toBeCloseTo(0.15, 12);
    expect(view.capacityUsedShare).toBeCloseTo(0.25, 12);
    // Full value: revenue less cost of goods is the markup, the gross profit.
    expect(view.revenue).toBeCloseTo(view.soldToHouseholds, 9);
    expect(view.costOfGoods).toBeCloseTo(view.goodsBoughtWholesale, 9);
    expect(view.revenue - view.costOfGoods).toBeCloseTo(view.grossProfit, 9);
    expect(view.grossProfit).toBeCloseTo(view.markupEarned, 9);
    expect(view.grossProfit - view.runningCosts).toBeCloseTo(view.margin, 9);
  });

  it("shows anchor receipts in the sector's own currency", () => {
    const anchor = storeLedgerView({ turn: 247, turnsPerDay: 1, receipt });
    const cad = storeLedgerView({ turn: 247, turnsPerDay: 1, localPerAnchor: 1.5, receipt });
    expect(cad.revenue).toBeCloseTo(anchor.revenue * 1.5, 9);
    expect(cad.costOfGoods).toBeCloseTo(anchor.costOfGoods * 1.5, 9);
    expect(cad.margin).toBeCloseTo(receipt.profit * 1.5, 9);
    // Rates and shares do not change with the currency.
    expect(cad.markupRate).toBeCloseTo(anchor.markupRate!, 12);
  });

  it("puts any running cost the receipt does not name in its own line", () => {
    const view = storeLedgerView({
      turn: 247,
      turnsPerDay: 1,
      receipt: { ...receipt, profit: 30 },
    });
    expect(view.runningCostRows.find((r) => r.key === "other")!.value).toBeCloseTo(10, 9);
    expect(view.runningCostRows.reduce((n, r) => n + r.value, 0)).toBeCloseTo(view.runningCosts, 9);
  });

  it("leaves the rate and the capacity share empty when there is nothing to read", () => {
    const view = storeLedgerView({
      turn: 247,
      turnsPerDay: 1,
      receipt: {
        ...receipt,
        store: { goodsBoughtWholesale: 0, markupEarned: 0, wholesaleByCommodity: {} },
        profit: -5,
        producedUnits: undefined,
        offeredUnits: undefined,
      },
    });
    expect(view.markupRate).toBeNull();
    expect(view.capacityUsedShare).toBeNull();
    expect(view.margin).toBeCloseTo(-5, 9);
  });
});
