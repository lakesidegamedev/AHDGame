import { describe, expect, it } from "vitest";
import { nominalTaxBaseGrowthPct } from "./nominalGrowth";

describe("nominalTaxBaseGrowthPct", () => {
  it("passes real growth through when prices are flat", () => {
    expect(nominalTaxBaseGrowthPct(2, 0)).toBe(2);
    expect(nominalTaxBaseGrowthPct(2, null)).toBe(2);
  });

  it("adds positive inflation to real growth", () => {
    expect(nominalTaxBaseGrowthPct(2, 3)).toBe(5);
    expect(nominalTaxBaseGrowthPct(0, 4)).toBe(4);
  });

  it("floors deflation so a base is not cut", () => {
    expect(nominalTaxBaseGrowthPct(1, -2)).toBe(1);
    expect(nominalTaxBaseGrowthPct(2, -10)).toBe(2);
  });

  it("treats non-finite readings as zero", () => {
    expect(nominalTaxBaseGrowthPct(Number.NaN, 3)).toBe(3);
    expect(nominalTaxBaseGrowthPct(2, Number.POSITIVE_INFINITY)).toBe(2);
    expect(nominalTaxBaseGrowthPct(undefined, undefined)).toBe(0);
  });
});
