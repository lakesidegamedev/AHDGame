import { describe, expect, it } from "vitest";
import { simulatePoverty } from "./poverty";

describe("cross-country poverty trajectories", () => {
  it("responds to funding, repeal and employment without permanently accumulating law bonuses", () => {
    const rows = ["US", "UK", "JP", "IE", "SCO", "WAL", "DE"].map((country) => ({
      id: country,
      country,
      population: 1000,
      poverty: 20,
      baseline: 15,
      unemployment: 10,
      giniInput: 42,
      crimeInput: 4500,
      socialReferencePerCapita: 1000,
      deliveredPressure: 1.5,
    }));
    const report = simulatePoverty(rows);
    for (const country of rows.map((row) => row.country)) {
      const result = (scenario: string, turn = 384) =>
        report.summary.find((r) => r.country === country && r.scenario === scenario)!.points[turn]!;
      expect(result("funded")).toBeLessThan(result("half_funding"));
      expect(result("half_funding")).toBeLessThan(result("zero_funding"));
      expect(result("repeal_after_48", 48)).toBe(result("funded", 48));
      expect(result("repeal_after_48")).toBeCloseTo(result("zero_funding"), 1);
      expect(result("unemployment_2")).toBeLessThan(result("unemployment_5"));
      expect(Math.abs(result("funded") - result("funded", 192))).toBeLessThan(0.5);
    }
  });
});
