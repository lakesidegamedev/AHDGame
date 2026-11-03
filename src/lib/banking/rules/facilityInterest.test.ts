import { describe, expect, it } from "vitest";
import { facilityInterestTransition, interestBearingCbMarginDebt } from "./facilityInterest";

describe("interestBearingCbMarginDebt (#1694)", () => {
  it("charges nothing on a line that is entirely an injection", () => {
    expect(
      interestBearingCbMarginDebt({
        cbMarginDebt: 100_000_000_000,
        cbLiquidityAdvanceDebt: 100_000_000_000,
      })
    ).toBe(0);
  });

  it("charges only the drawn part of a mixed line", () => {
    expect(interestBearingCbMarginDebt({ cbMarginDebt: 500, cbLiquidityAdvanceDebt: 300 })).toBe(
      200
    );
  });

  it("treats a line with no injection as fully interest-bearing", () => {
    expect(interestBearingCbMarginDebt({ cbMarginDebt: 500 })).toBe(500);
    expect(interestBearingCbMarginDebt({ cbMarginDebt: 500, cbLiquidityAdvanceDebt: null })).toBe(
      500
    );
  });

  it("never goes negative when the advance marker exceeds the line", () => {
    expect(interestBearingCbMarginDebt({ cbMarginDebt: 100, cbLiquidityAdvanceDebt: 300 })).toBe(0);
    expect(interestBearingCbMarginDebt({})).toBe(0);
  });

  it("produces a zero-charge transition for a fully injected line", () => {
    const transition = facilityInterestTransition({
      key: "k",
      bankId: "a".repeat(24),
      centralBankId: "US",
      currency: "USD",
      turn: 10,
      facility: "cbMargin",
      debt: interestBearingCbMarginDebt({ cbMarginDebt: 1e9, cbLiquidityAdvanceDebt: 1e9 }),
      ratePercent: 5,
      availableCash: 1e9,
    });
    expect(transition.legs).toEqual([]);
  });
});
