import { describe, expect, it } from "vitest";
import {
  buildWorkThisTurn,
  CAPITAL_GOODS_BASKET,
  investmentBuyerFunding,
} from "./capitalSpendRules";

describe("construction work as demand", () => {
  it("spreads a smooth order's paid cost over its window and never more than it paid", () => {
    const order = { costPaidAnchor: 100, startTurn: 10, onlineTurn: 14, smooth: true };
    const slices = [10, 11, 12, 13, 14, 15].map((t) => buildWorkThisTurn(order, t));
    expect(slices).toEqual([0, 25, 25, 25, 25, 0]);
    expect(slices.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("buys an all-at-once order's work when it lands, so a refund before landing cannot add to it", () => {
    const order = { costPaidAnchor: 100, startTurn: 10, onlineTurn: 14 };
    expect([11, 12, 13].map((t) => buildWorkThisTurn(order, t))).toEqual([0, 0, 0]);
    expect(buildWorkThisTurn(order, 14)).toBe(100);
  });

  it("never buys more than paid plus refundable remainder after a cancellation", () => {
    // Bought through turn 12 of a smooth order, then cancelled: the refund is
    // 75% of the undelivered half, so bought + refund stays under cost.
    const order = { costPaidAnchor: 100, startTurn: 10, onlineTurn: 14, smooth: true };
    const bought = [11, 12].reduce((s, t) => s + buildWorkThisTurn(order, t), 0);
    const refund = 0.75 * 100 * (1 - 0.5);
    expect(bought + refund).toBeLessThanOrEqual(100);
  });

  it("buys an instant order once and ignores unpaid or invalid orders", () => {
    expect(buildWorkThisTurn({ costPaidAnchor: 50, startTurn: 5, onlineTurn: 5 }, 5)).toBe(50);
    expect(buildWorkThisTurn({ costPaidAnchor: 50, startTurn: 5, onlineTurn: 5 }, 6)).toBe(0);
    expect(buildWorkThisTurn({ costPaidAnchor: 0, startTurn: 1, onlineTurn: 3 }, 2)).toBe(0);
    expect(buildWorkThisTurn({ costPaidAnchor: NaN, startTurn: 1, onlineTurn: 3 }, 2)).toBe(0);
  });

  it("splits a country's work over the basket, local services on the sector's state", () => {
    const [us] = investmentBuyerFunding(
      [
        {
          countryId: "US",
          stateId: "TX",
          buildQueue: [{ costPaidAnchor: 100, startTurn: 0, onlineTurn: 1, smooth: true }],
        },
        {
          countryId: "",
          stateId: "CA",
          buildQueue: [{ costPaidAnchor: 999, startTurn: 0, onlineTurn: 1 }],
        },
      ],
      1
    );
    expect(us.countryId).toBe("US");
    expect(us.fundingLocal).toBeCloseTo(100);
    const construction = us.lines.find((l) => l.commodity === "construction_services");
    expect(construction).toMatchObject({ book: "state:TX" });
    expect(construction!.amountLocal).toBeCloseTo(
      100 * CAPITAL_GOODS_BASKET.construction_services!
    );
    expect(us.lines.find((l) => l.commodity === "steel")).toMatchObject({ book: "world" });
  });

  it("basket weights sum to one", () => {
    const total = Object.values(CAPITAL_GOODS_BASKET).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeCloseTo(1);
  });
});
