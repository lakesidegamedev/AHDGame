import { describe, expect, it } from "vitest";
import { checkTaxLine, reconcileRevenueLines } from "./stateRevenueLines";

describe("checkTaxLine", () => {
  it("matches when the booked line is base times rate", () => {
    const c = checkTaxLine(20_520, 5, 410_400);
    expect(c.computed).toBeCloseTo(20_520, 6);
    expect(c.matches).toBe(true);
  });

  it("flags a booked line that lags base times rate", () => {
    const c = checkTaxLine(19_700, 5, 410_300);
    expect(c.computed).toBeCloseTo(20_515, 6);
    expect(c.matches).toBe(false);
    expect(c.gapPct).toBeLessThan(-3);
  });

  it("does not compare when the base or rate is missing", () => {
    expect(checkTaxLine(10, undefined, 100).matches).toBe(true);
    expect(checkTaxLine(10, 5, undefined).computed).toBeNull();
  });
});

describe("reconcileRevenueLines", () => {
  it("lists lines that sum to the total", () => {
    const { lines, total } = reconcileRevenueLines({ a: 60, b: 40, total: 100 });
    expect(lines.reduce((s, l) => s + l.value, 0)).toBe(total);
  });

  it("shows the difference as its own line instead of hiding it", () => {
    const { lines, total } = reconcileRevenueLines({ a: 60, b: 30, total: 100 });
    expect(lines.at(-1)).toEqual({ key: "unitemisedRevenue", value: 10 });
    expect(lines.reduce((s, l) => s + l.value, 0)).toBe(total);
  });
});
