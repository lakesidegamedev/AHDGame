import { describe, it, expect } from "vitest";
import { fundPositionValue } from "./portfolioValue";
describe("fund portfolio valuation", () => {
  it.each(["active", "paused"])("values a %s position at quoted NAV", (status) =>
    expect(fundPositionValue(10, 25, status)).toBe(250)
  );
  it("does not value delisted funds or missing quotes", () => {
    expect(fundPositionValue(10, 25, "delisted")).toBe(0);
    expect(fundPositionValue(10, undefined)).toBe(0);
  });
});
