import { describe, expect, it } from "vitest";
import { fundedFreightDispatchMultiplier, fundedFreightGaps } from "./fundedFreightDispatchRules";

describe("funded freight dispatch", () => {
  it("uses the unfilled share of funded freight only, in turn units", () => {
    const gaps = fundedFreightGaps([
      { countryId: "JP", commodity: "freight", funded: 96, filled: 72 },
      { countryId: "US", commodity: "freight", funded: 96, filled: 73 },
      { countryId: "FR", commodity: "freight", funded: 48, filled: 0 },
      { countryId: "CA", commodity: "financial_services", funded: 96, filled: 0 },
      { countryId: "DE", commodity: "freight", funded: 48 },
      { countryId: "GB", commodity: "freight", funded: 0, filled: 0 },
      { countryId: "CN", commodity: "freight", funded: 48, filled: 60 },
    ]);
    expect([...gaps]).toEqual([
      ["JP", 1],
      ["FR", 2],
    ]);
  });

  it("shares a country's extra work across depots and caps their dispatch gain", () => {
    const smallDepot = 2;
    const largeDepot = 8;
    const total = smallDepot + largeDepot;
    const multiplier = fundedFreightDispatchMultiplier(3, total);
    expect(smallDepot * multiplier + largeDepot * multiplier - total).toBeCloseTo(3);
    expect(fundedFreightDispatchMultiplier(20, total)).toBe(1.5);
    expect(fundedFreightDispatchMultiplier(0, total)).toBe(1);
    expect(fundedFreightDispatchMultiplier(3, 0)).toBe(1);
  });
});
