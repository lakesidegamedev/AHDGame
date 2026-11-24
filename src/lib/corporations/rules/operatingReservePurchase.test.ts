import { describe, expect, it } from "vitest";
import {
  isOperatingReserveRefusal,
  operatingReserveMessage,
  purchaseOverCashMessage,
  purchaseReserveVerdict,
  restingOrderReserveTrim,
  restingOrderTrimReason,
} from "./operatingReserve";

describe("corporate share purchases and the operating reserve", () => {
  // Bills of 100k a turn, 3 turns: a 300k reserve.
  const base = { billsPerTurn: 100_000, turns: 3 };

  it("allows a purchase that keeps the reserve", () => {
    expect(
      purchaseReserveVerdict({ ...base, cash: 1_000_000, cost: 700_000, confirmed: false })
    ).toEqual({ kind: "ok" });
  });

  it("refuses a purchase into the reserve without a confirm", () => {
    const verdict = purchaseReserveVerdict({
      ...base,
      cash: 1_000_000,
      cost: 900_000,
      confirmed: false,
    });
    expect(verdict.kind).toBe("below_reserve");
    if (verdict.kind === "below_reserve") {
      expect(verdict.check.reserve).toBe(300_000);
      expect(verdict.check.maxAffordable).toBe(700_000);
    }
  });

  it("lets a confirmed purchase through the reserve", () => {
    expect(
      purchaseReserveVerdict({ ...base, cash: 1_000_000, cost: 900_000, confirmed: true })
    ).toEqual({ kind: "ok" });
  });

  it("always refuses a purchase that costs more than the cash, confirm or not", () => {
    for (const confirmed of [false, true])
      expect(
        purchaseReserveVerdict({ ...base, cash: 1_000_000, cost: 1_000_001, confirmed })
      ).toEqual({ kind: "over_cash" });
  });

  it("refuses over-cash even for a company with no plants", () => {
    expect(
      purchaseReserveVerdict({ cash: 10, cost: 11, billsPerTurn: 0, turns: 3, confirmed: true })
    ).toEqual({ kind: "over_cash" });
  });

  it("does not hold a company with no running bills to a reserve", () => {
    expect(
      purchaseReserveVerdict({ cash: 10, cost: 10, billsPerTurn: 0, turns: 3, confirmed: false })
    ).toEqual({ kind: "ok" });
  });

  it("says purchase, not build, in the refusal", () => {
    const text = operatingReserveMessage({
      costLocal: 2_458_900,
      cashLocal: 2_499_643,
      reserveLocal: 1_500_000,
      maxAffordableLocal: 999_643,
      turns: 3,
      currencyCode: "USD",
      spend: "purchase",
    });
    expect(text).toContain("This purchase would leave $40,743 in cash");
    expect(text).toContain("$1,500,000");
    expect(text).toContain("The most you can spend and keep that reserve is $999,643");
    expect(text).not.toMatch(new RegExp("[\\u2013\\u2014]"));
    expect(purchaseOverCashMessage({ costLocal: 20, cashLocal: 10, currencyCode: "USD" })).toBe(
      "This purchase costs $20, more than the $10 the company has. A company cannot spend into debt on the share market."
    );
  });

  it("keeps the build wording by default", () => {
    expect(
      operatingReserveMessage({
        costLocal: 1,
        cashLocal: 1,
        reserveLocal: 1,
        maxAffordableLocal: 0,
        turns: 3,
        currencyCode: "USD",
      })
    ).toMatch(/^This build would leave/);
  });

  it("recognises the refusal body the API sends", () => {
    expect(isOperatingReserveRefusal({ code: "OPERATING_RESERVE_SHORT", error: "x" })).toBe(true);
    expect(isOperatingReserveRefusal({ code: "CONFLICT" })).toBe(false);
    expect(isOperatingReserveRefusal(null)).toBe(false);
  });
});

describe("resting corporate buy orders at turn time", () => {
  it("leaves orders alone when cash already covers the reserve", () => {
    expect(
      restingOrderReserveTrim({
        cash: 500,
        reserve: 300,
        orders: [{ id: "a", sharesRemaining: 10, escrowInBuyerUnits: 100 }],
      })
    ).toEqual([]);
  });

  it("gives back just enough whole shares of escrow, newest order first", () => {
    // Short 250: order a holds 10 shares at 10 each, order b 100 shares at 5.
    const trims = restingOrderReserveTrim({
      cash: 50,
      reserve: 300,
      orders: [
        { id: "a", sharesRemaining: 10, escrowInBuyerUnits: 100 },
        { id: "b", sharesRemaining: 100, escrowInBuyerUnits: 500 },
      ],
    });
    expect(trims).toEqual([
      { id: "a", sharesReleased: 10, releasedInBuyerUnits: 100 },
      { id: "b", sharesReleased: 30, releasedInBuyerUnits: 150 },
    ]);
  });

  it("releases everything it can when the orders cannot restore the reserve", () => {
    expect(
      restingOrderReserveTrim({
        cash: -11_000,
        reserve: 1_000_000,
        orders: [{ id: "a", sharesRemaining: 1_000, escrowInBuyerUnits: 2_000 }],
      })
    ).toEqual([{ id: "a", sharesReleased: 1_000, releasedInBuyerUnits: 2_000 }]);
  });

  it("explains the trim in plain words", () => {
    const reason = restingOrderTrimReason({ releasedLocal: 1234.4, turns: 3, currencyCode: "USD" });
    expect(reason).toBe(
      "Released $1,234 of escrow so the company keeps 3 turns of running costs in cash"
    );
  });
});
