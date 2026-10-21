import { describe, expect, it } from "vitest";
import { publicOrders } from "./shadowRules";
import {
  publicOrderId,
  PUBLIC_CARRY_MAX_TURNS,
  capCarry,
  carryLineKey,
  carryTotal,
  nextLineCarry,
  withCarriedLines,
} from "./publicCarryRules";

const order = (id: string, budget: number, fresh = budget) => ({
  id,
  commodity: id,
  book: "world",
  budget,
  fresh,
});

describe("public carry", () => {
  it("keeps a share of the unfilled part of a short line and nothing from a filled one", () => {
    const carry = nextLineCarry(
      [order("healthcare", 100), order("steel", 100)],
      [
        { id: "healthcare", requestedUnits: 10, deliveredUnits: 2 },
        { id: "steel", requestedUnits: 10, deliveredUnits: 10 },
      ],
      0.5
    );
    expect(carry[carryLineKey("healthcare", "world")]).toBeCloseTo(40);
    expect(carry[carryLineKey("steel", "world")]).toBeUndefined();
  });

  it("caps a line at a few turns of its own outlay", () => {
    const carry = nextLineCarry(
      [order("healthcare", 1000, 10)],
      [{ id: "healthcare", requestedUnits: 10, deliveredUnits: 0 }],
      1
    );
    expect(carry[carryLineKey("healthcare", "world")]).toBe(PUBLIC_CARRY_MAX_TURNS * 10);
  });

  it("is off at share 0 and ignores orders with no outcome", () => {
    expect(
      nextLineCarry([order("a", 5)], [{ id: "a", requestedUnits: 1, deliveredUnits: 0 }], 0)
    ).toEqual({});
    expect(nextLineCarry([order("a", 5)], [], 0.5)).toEqual({});
  });

  it("adds carry to the matching line only", () => {
    const lines = [
      { commodity: "healthcare", book: "world", amountLocal: 10 },
      { commodity: "steel", book: "world", amountLocal: 10 },
    ];
    const out = withCarriedLines(lines, { [carryLineKey("healthcare", "world")]: 7, gone: 99 });
    expect(out.map((l) => l.amountLocal)).toEqual([17, 10]);
    expect(lines[0].amountLocal).toBe(10);
  });

  it("scales a carry to the wallet's real balance and never exceeds it", () => {
    const capped = capCarry({ a: 30, b: 10 }, 20);
    expect(carryTotal(capped)).toBeCloseTo(20);
    expect(capped.a / capped.b).toBeCloseTo(3);
    expect(capCarry({ a: 30 }, 0)).toEqual({});
    expect(capCarry({ a: 30 }, 100)).toEqual({ a: 30 });
  });

  it("names a line's order exactly as publicOrders does", () => {
    const [order] = publicOrders(
      [
        {
          accountId: "acct",
          lines: [{ commodity: "healthcare_services", book: "world", amountLocal: 10 }],
        },
      ],
      () => 2,
      1.25
    );
    expect(publicOrderId("acct", "healthcare_services", "world")).toBe(order.id);
  });
});
