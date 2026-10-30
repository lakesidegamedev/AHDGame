import { describe, expect, it } from "vitest";
import { fundedRealOutputAnchor, fundedSectorValueAnchor } from "./fundedValuationRules";

const base = { turnsPerYear: 48, annualDiscountRate: 0.15, bookFloorAnchor: 1_000_000 };

describe("fundedSectorValueAnchor", () => {
  it("values a sector that sold nothing at its paid capacity book, however short its goods are", () => {
    // Zero sales: the settlement says revenue 0, so profit is the bills it still pays.
    expect(fundedSectorValueAnchor({ ...base, profitPerTurn: -5_000 })).toBe(1_000_000);
    expect(fundedSectorValueAnchor({ ...base, profitPerTurn: 0 })).toBe(1_000_000);
  });

  it("capitalizes realized earnings and rises with them", () => {
    const low = fundedSectorValueAnchor({ ...base, profitPerTurn: 10_000 });
    const high = fundedSectorValueAnchor({ ...base, profitPerTurn: 20_000 });
    expect(low).toBe(Math.round((10_000 * 48) / 0.15));
    expect(high).toBe(2 * low);
  });

  it("boosts the earnings value only, never the book floor", () => {
    expect(fundedSectorValueAnchor({ ...base, profitPerTurn: 0, npvBoostMultiplier: 1.3 })).toBe(
      1_000_000
    );
    expect(
      fundedSectorValueAnchor({ ...base, profitPerTurn: 10_000, npvBoostMultiplier: 1.3 })
    ).toBe(Math.round(((10_000 * 48) / 0.15) * 1.3));
  });

  it("fails closed on bad inputs", () => {
    expect(
      fundedSectorValueAnchor({ ...base, profitPerTurn: Number.NaN, bookFloorAnchor: -1 })
    ).toBe(0);
    expect(fundedSectorValueAnchor({ ...base, profitPerTurn: 10, annualDiscountRate: 0 })).toBe(
      1_000_000
    );
  });
});

describe("fundedRealOutputAnchor", () => {
  it("values units sold at the fixed base mix price", () => {
    expect(fundedRealOutputAnchor(4, 250)).toBe(1_000);
    expect(fundedRealOutputAnchor(0, 250)).toBe(0);
    expect(fundedRealOutputAnchor(Number.NaN, 250)).toBe(0);
  });
});
