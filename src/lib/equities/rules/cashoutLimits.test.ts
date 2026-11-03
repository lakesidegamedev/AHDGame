import { describe, expect, it } from "vitest";
import {
  controlledHoldingCollateral,
  isControllingHolder,
  placedInWindow,
  primaryPlacementPriceCap,
  primaryWindowBudget,
  resolvePrimaryPlacementLimits,
  tangibleBook,
  trailingAnnualEarnings,
} from "./cashoutLimits";

describe("tangibleBook", () => {
  it("is cash plus paid capacity plus construction, less debt", () => {
    expect(
      tangibleBook({ cash: 100, paidCapacity: 400, constructionInProgress: 50, debt: 150 })
    ).toBe(400);
  });

  it("keeps an overdraft negative and ignores bad inputs", () => {
    expect(
      tangibleBook({ cash: -100, paidCapacity: Number.NaN, constructionInProgress: 0, debt: 0 })
    ).toBe(-100);
  });
});

describe("trailingAnnualEarnings", () => {
  it("averages the history and floors losses at zero", () => {
    expect(trailingAnnualEarnings([30, 60, 90])).toBe(60);
    expect(trailingAnnualEarnings([-90, 30])).toBe(0);
    expect(trailingAnnualEarnings(undefined)).toBe(0);
  });
});

describe("primaryPlacementPriceCap", () => {
  it("caps an inflated price with flat earnings at book per share", () => {
    expect(
      primaryPlacementPriceCap({
        fundamentalPrice: 200,
        bookPerShare: 20,
        annualEarningsPerShare: 0,
      })
    ).toBe(20);
  });

  it("leaves an honestly priced company at its fundamental", () => {
    expect(
      primaryPlacementPriceCap({
        fundamentalPrice: 10,
        bookPerShare: 20,
        annualEarningsPerShare: 0,
      })
    ).toBe(10);
  });

  it("lets realized earnings back a price above book, up to 15 times", () => {
    expect(
      primaryPlacementPriceCap({ fundamentalPrice: 40, bookPerShare: 5, annualEarningsPerShare: 2 })
    ).toBe(30);
  });

  it("uses the backing alone when the company has no fundamental yet", () => {
    expect(primaryPlacementPriceCap({ bookPerShare: 7, annualEarningsPerShare: 0 })).toBe(7);
  });

  it("never goes below zero for a company with negative book", () => {
    expect(
      primaryPlacementPriceCap({ fundamentalPrice: 5, bookPerShare: -3, annualEarningsPerShare: 0 })
    ).toBe(0);
  });
});

describe("primaryWindowBudget", () => {
  it("allows up to the book equity when nothing was placed", () => {
    expect(primaryWindowBudget({ bookEquity: 100, placedInWindow: 0 })).toBe(100);
  });

  it("measures against the equity the window started from", () => {
    // 100 of starting equity; 30 placed raised book to 130; 70 left.
    expect(primaryWindowBudget({ bookEquity: 130, placedInWindow: 30 })).toBe(70);
    // A full placement does not raise its own limit.
    expect(primaryWindowBudget({ bookEquity: 200, placedInWindow: 100 })).toBe(0);
  });

  it("counts only placements inside the last 48 turns", () => {
    const entries = [
      { turn: 50, paidLocal: 500 },
      { turn: 53, paidLocal: 20 },
      { turn: 100, paidLocal: 10 },
    ];
    expect(placedInWindow(entries, 100)).toBe(30);
  });
});

describe("resolvePrimaryPlacementLimits", () => {
  it("pays the lower of asking and cap and converts the budget to shares", () => {
    expect(
      resolvePrimaryPlacementLimits({ askingPrice: 200, capPrice: 20, windowBudget: 1000 })
    ).toEqual({
      askingPrice: 200,
      capPrice: 20,
      price: 20,
      priceCapped: true,
      windowBudget: 1000,
      maxShares: 50,
    });
    expect(
      resolvePrimaryPlacementLimits({ askingPrice: 10, capPrice: 20, windowBudget: 1000 })
    ).toMatchObject({ price: 10, priceCapped: false, maxShares: 100 });
  });
});

describe("controlled holdings", () => {
  it("treats the CEO and holders above 20% as controlling", () => {
    expect(isControllingHolder({ isCeo: true, shares: 1, totalShares: 1000 })).toBe(true);
    expect(isControllingHolder({ isCeo: false, shares: 201, totalShares: 1000 })).toBe(true);
    expect(isControllingHolder({ isCeo: false, shares: 200, totalShares: 1000 })).toBe(false);
  });

  it("counts each share at the lower of book and half the quote", () => {
    expect(
      controlledHoldingCollateral({ shares: 100, quote: 100, bookPerShare: 20, leveredShares: 0 })
    ).toBe(2000);
    expect(
      controlledHoldingCollateral({ shares: 100, quote: 30, bookPerShare: 20, leveredShares: 0 })
    ).toBe(1500);
  });

  it("counts shares bought with recent borrowing at zero", () => {
    expect(
      controlledHoldingCollateral({ shares: 100, quote: 100, bookPerShare: 20, leveredShares: 40 })
    ).toBe(1200);
    expect(
      controlledHoldingCollateral({ shares: 100, quote: 100, bookPerShare: 20, leveredShares: 400 })
    ).toBe(0);
  });
});
