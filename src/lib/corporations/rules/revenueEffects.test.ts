import { describe, expect, it } from "vitest";
import { computeRevenueEffects, subsidyReceived } from "./revenueEffects";

describe("computeRevenueEffects", () => {
  it("turns each leg's points into a share of sold revenue", () => {
    const r = computeRevenueEffects({
      soldRevenue: 1000,
      legs: { homeLocation: 5, strategy: -2 },
    });
    expect(r.lines.map((l) => [l.key, l.amount])).toEqual([
      ["homeLocation", 50],
      ["strategy", -20],
    ]);
    expect(r.totalAmount).toBe(30);
    expect(r.capped).toBe(false);
  });

  it("skips zero and non-finite legs", () => {
    const r = computeRevenueEffects({
      soldRevenue: 100,
      legs: { homeLocation: 0, strike: Number.NaN },
    });
    expect(r.lines).toEqual([]);
    expect(r.totalAmount).toBe(0);
  });

  it("caps the net at 30 percent and scales every line so they still add up", () => {
    const r = computeRevenueEffects({
      soldRevenue: 1000,
      legs: { regulatoryBurden: -40, disaster: -20, homeLocation: 5 },
    });
    expect(r.capped).toBe(true);
    expect(r.totalAmount).toBeCloseTo(-300, 6);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(r.totalAmount, 6);
    expect(r.totalPp).toBeCloseTo(-30, 6);
  });

  it("caps positive stacks too", () => {
    const r = computeRevenueEffects({
      soldRevenue: 200,
      legs: { sectorTypeMatch: 25, exportPremium: 25 },
    });
    expect(r.totalAmount).toBeCloseTo(60, 6);
  });

  it("pays nothing on zero sold revenue", () => {
    const r = computeRevenueEffects({ soldRevenue: 0, legs: { homeLocation: 5 } });
    expect(r.totalAmount).toBe(0);
  });
});

describe("subsidyReceived", () => {
  it("is the leg in points of sold revenue, never negative", () => {
    expect(subsidyReceived(1000, 7.5)).toBe(75);
    expect(subsidyReceived(1000, -3)).toBe(0);
    expect(subsidyReceived(-5, 7.5)).toBe(0);
  });
});
