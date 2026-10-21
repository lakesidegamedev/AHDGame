import { describe, expect, it } from "vitest";
import { spilloverOrders } from "./spilloverRules";
import type { PurchaseOrder } from "./rules";

const order = (id: string, commodity: string, units: number, price: number): PurchaseOrder => ({
  id,
  accountId: "hh",
  commodity,
  book: "world",
  units,
  maximumUnitPrice: price,
});
const laneKey = (c: string, b: string) => `${c}|${b}`;

describe("same-turn spillover", () => {
  const orders = [
    order("care", "healthcare_services", 10, 10),
    order("tv", "electronics", 5, 20),
    order("food", "food", 20, 5),
  ];
  // Healthcare sold out and filled 40 of 100 wanted; electronics and food have stock.
  const outcomes = new Map([
    ["care", { cost: 40 }],
    ["tv", { cost: 100 }],
    ["food", { cost: 100 }],
  ]);
  const unsold = new Map([
    [laneKey("electronics", "world"), 3],
    [laneKey("food", "world"), 50],
  ]);

  it("moves the substitution share of stranded spend onto lanes with supply, by what was wanted there", () => {
    const { orders: next, stats } = spilloverOrders({
      orders,
      accounts: new Set(["hh"]),
      outcomes,
      unsoldUnits: unsold,
      laneKey,
      share: 0.7,
    });
    expect(stats.strandedSpend).toBeCloseTo(60, 10);
    expect(stats.extraRequested).toBeCloseTo(42, 10);
    const spendOf = (id: string) => {
      const o = next.find((x) => x.id === id)!;
      return Math.min(o.units * o.maximumUnitPrice, o.maximumSpend ?? Infinity);
    };
    expect(spendOf("care")).toBeCloseTo(100, 10);
    expect(spendOf("tv")).toBeCloseTo(100 + 42 * 0.5, 10);
    expect(spendOf("food")).toBeCloseTo(100 + 42 * 0.5, 10);
  });

  it("changes nothing when nothing is stranded, for other buyers, or at zero share", () => {
    const allSupply = new Map([
      [laneKey("healthcare_services", "world"), 5],
      [laneKey("electronics", "world"), 3],
      [laneKey("food", "world"), 50],
    ]);
    expect(
      spilloverOrders({
        orders,
        accounts: new Set(["hh"]),
        outcomes,
        unsoldUnits: allSupply,
        laneKey,
        share: 0.7,
      }).orders
    ).toEqual(orders);
    expect(
      spilloverOrders({
        orders,
        accounts: new Set(["x"]),
        outcomes,
        unsoldUnits: unsold,
        laneKey,
        share: 0.7,
      }).orders
    ).toEqual(orders);
    expect(
      spilloverOrders({
        orders,
        accounts: new Set(["hh"]),
        outcomes,
        unsoldUnits: unsold,
        laneKey,
        share: 0,
      }).stats.extraRequested
    ).toBe(0);
  });

  it("does not push stranded spend anywhere when every lane is sold out", () => {
    const none = spilloverOrders({
      orders,
      accounts: new Set(["hh"]),
      outcomes,
      unsoldUnits: new Map(),
      laneKey,
      share: 0.7,
    });
    expect(none.stats.extraRequested).toBe(0);
    expect(none.orders).toEqual(orders);
  });
});
