import { describe, expect, it } from "vitest";
import { automationLevyTransfers, plantOfInputOrder, type LevyTrade } from "./levyCloseRules";

const order = (plant: string, commodity = "steel") => JSON.stringify([plant, "input", commodity]);
const sale = (plant: string, buyer: string, amount: number): LevyTrade => ({
  kind: "sale",
  orderId: order(plant),
  buyerAccountId: buyer,
  amount,
});
const levyByPlant = new Map([["p1", { countryId: "US", penalty: 0.1 }]]);
const collectorOf = (c: string) => (c === "US" ? "collector-US" : null);

describe("plantOfInputOrder", () => {
  it("reads the plant from an input order id only", () => {
    expect(plantOfInputOrder(order("p1"))).toBe("p1");
    expect(plantOfInputOrder(JSON.stringify(["p1", "labour"]))).toBeNull();
    expect(plantOfInputOrder("not json")).toBeNull();
  });
});

describe("automationLevyTransfers", () => {
  it("pays the levy rate on input spend from the company to the treasury collector", () => {
    const close = automationLevyTransfers({
      trades: [sale("p1", "corpA", 1000), sale("p1", "corpA", 500)],
      levyByPlant,
      collectorOf,
      cashOf: () => 1e6,
    });
    expect(close.transfers).toEqual([
      { fromAccountId: "corpA", toAccountId: "collector-US", countryId: "US", amount: 150 },
    ]);
    expect(close.shortfall).toBe(0);
  });

  it("conserves money: what companies pay equals what the treasury collects", () => {
    const levies = new Map([
      ["p1", { countryId: "US", penalty: 0.1 }],
      ["p2", { countryId: "US", penalty: 0.05 }],
    ]);
    const close = automationLevyTransfers({
      trades: [sale("p1", "corpA", 1000), sale("p2", "corpB", 400), sale("p3", "corpC", 900)],
      levyByPlant: levies,
      collectorOf,
      cashOf: () => 1e6,
    });
    const paid = [...close.paidByAccount.values()].reduce((a, b) => a + b, 0);
    const received = [...close.collectedByCountry.values()].reduce((a, b) => a + b, 0);
    const moved = close.transfers.reduce((a, t) => a + t.amount, 0);
    expect(paid).toBeCloseTo(120);
    expect(received).toBeCloseTo(paid);
    expect(moved).toBeCloseTo(paid);
  });

  it("owes nothing on plants without a levy, internal transfers or countries with no collector", () => {
    const close = automationLevyTransfers({
      trades: [
        sale("p9", "corpA", 1000),
        { ...sale("p1", "corpA", 1000), kind: "internalTransfer" },
      ],
      levyByPlant,
      collectorOf,
      cashOf: () => 1e6,
    });
    expect(close.transfers).toEqual([]);
    const none = automationLevyTransfers({
      trades: [sale("p1", "corpA", 1000)],
      levyByPlant,
      collectorOf: () => null,
      cashOf: () => 1e6,
    });
    expect(none.transfers).toEqual([]);
  });

  it("caps at the company's closing cash across all its plants and reports the shortfall", () => {
    const levies = new Map([
      ["p1", { countryId: "US", penalty: 0.1 }],
      ["p2", { countryId: "US", penalty: 0.1 }],
    ]);
    const close = automationLevyTransfers({
      trades: [sale("p1", "corpA", 1000), sale("p2", "corpA", 1000)],
      levyByPlant: levies,
      collectorOf,
      cashOf: () => 150,
    });
    expect(close.paidByAccount.get("corpA")).toBeCloseTo(150);
    expect(close.shortfall).toBeCloseTo(50);
  });
});
