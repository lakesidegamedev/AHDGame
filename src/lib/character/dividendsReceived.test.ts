import { describe, expect, it } from "vitest";
import { sumLatestDividendTurn } from "./dividendsReceived";

describe("sumLatestDividendTurn", () => {
  it("sums only the newest payout turn, in anchor units", () => {
    expect(
      sumLatestDividendTurn([
        { turn: 124, amount: 7_000, anchorAmount: 7_700 },
        { turn: 125, amount: 300, anchorAmount: 330 },
        { turn: 125, amount: 69, anchorAmount: 70 },
      ])
    ).toEqual({ turn: 125, amountAnchor: 400 });
  });

  it("falls back to the local amount when no anchor value was logged", () => {
    expect(sumLatestDividendTurn([{ turn: 3, amount: 12 }])).toEqual({ turn: 3, amountAnchor: 12 });
  });

  it("is null with no payouts", () => {
    expect(sumLatestDividendTurn([])).toBeNull();
  });
});
