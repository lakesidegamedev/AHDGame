import { describe, expect, it } from "vitest";
import { openingStockCoupon } from "./openingStockCoupon";

const opening = {
  countryId: "US",
  fiscalYear: 2027,
  annualInterest: 1.326e12,
  uncoveredPrincipal: 39e12,
  coveredCoupons: 0,
};
describe("opening stock coupons", () => {
  it("reconciles the US opening stock with booked annual debt service", () => {
    expect(openingStockCoupon(opening)).toBeCloseTo(3.4, 12);
  });
  it("covers only the remaining obligation when existing tranches cover part of the debt", () => {
    const rate = openingStockCoupon({
      ...opening,
      uncoveredPrincipal: 29e12,
      coveredCoupons: 0.4e12,
    })!;
    expect(0.4e12 + (29e12 * rate) / 100).toBeCloseTo(1.326e12, 0);
  });
  it("does not silently issue against an invalid or already exceeded obligation", () => {
    for (const annualInterest of [undefined, NaN, -1])
      expect(() => openingStockCoupon({ ...opening, annualInterest })).toThrow("debt-service");
    expect(() => openingStockCoupon({ ...opening, coveredCoupons: 2e12 })).toThrow();
  });
  it("preserves the 1991 convention and other countries and eras", () => {
    expect(openingStockCoupon({ ...opening, fiscalYear: 1991, averageRate: 0.105 })).toBe(10.5);
    expect(openingStockCoupon({ ...opening, countryId: "UK" })).toBeNull();
    expect(openingStockCoupon({ ...opening, fiscalYear: 2019 })).toBeNull();
  });
});
