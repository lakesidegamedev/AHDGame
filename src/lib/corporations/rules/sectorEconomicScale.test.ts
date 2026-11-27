import { describe, expect, it } from "vitest";
import { sectorEconomicScale } from "./sectorEconomicScale";
describe("currency-consistent sector scale", () => {
  const idle = { sectorType: "agriculture" as const, revenue: 0, capitalStock: 100 };
  it("prices identical idle capacity equally in anchor units", () => {
    const usd = sectorEconomicScale(idle, true, 1, 1);
    expect(usd).toBeGreaterThan(0);
    expect(sectorEconomicScale(idle, true, 1, 100) / 100).toBeCloseTo(usd);
    expect(sectorEconomicScale(idle, true, 1, 2) / 2).toBeCloseTo(usd);
  });
  it("compares both sides in the same units and preserves revenue below plants", () => {
    const usd = sectorEconomicScale(idle, true, 1, 1);
    const site = { ...idle, revenue: usd * 150 };
    expect(sectorEconomicScale(site, true, 1, 100)).toBe(site.revenue);
    expect(sectorEconomicScale({ ...site, revenue: 10 }, false, 1, 100)).toBe(10);
    expect(() => sectorEconomicScale(site, true, 1, 0)).toThrow();
  });
});
