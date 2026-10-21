import { describe, expect, it } from "vitest";
import { marketAdjustmentApprovalModifiers, valueAtOrBefore } from "./approvalEffects";

describe("valueAtOrBefore", () => {
  const pts = [
    { turn: 3, value: 1 },
    { turn: 7, value: 2 },
    { turn: 5, value: 9 },
  ];
  it("returns the latest point not after the turn", () => {
    expect(valueAtOrBefore(pts, 6)).toBe(9);
    expect(valueAtOrBefore(pts, 7)).toBe(2);
    expect(valueAtOrBefore(pts, 100)).toBe(2);
  });
  it("is undefined before the first point or with no history", () => {
    expect(valueAtOrBefore(pts, 2)).toBeUndefined();
    expect(valueAtOrBefore(undefined, 5)).toBeUndefined();
  });
});

describe("marketAdjustmentApprovalModifiers", () => {
  it("makes a named, market-sourced negative chip", () => {
    const [chip] = marketAdjustmentApprovalModifiers({
      approval: -1.6,
      lossShare: 0.8,
      unemploymentRise: 1,
      open: true,
    });
    expect(chip).toMatchObject({
      id: "market_adjustment",
      label: "Market adjustment",
      effect: -1.6,
      source: "market",
      marginEffect: 0,
    });
  });

  it("makes no chip when there is no cost", () => {
    expect(marketAdjustmentApprovalModifiers(undefined)).toEqual([]);
    expect(
      marketAdjustmentApprovalModifiers({
        approval: 0,
        lossShare: 0.1,
        unemploymentRise: 0,
        open: true,
      })
    ).toEqual([]);
  });
});
