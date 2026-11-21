import { describe, expect, it } from "vitest";
import { taxableEarningsAnchor } from "./taxableEarningsAnchor";
describe("taxable earnings anchor", () => {
  it("retains witnessed mixed-currency values despite missing or changed rates", () => {
    expect(taxableEarningsAnchor(125, 100, 100, undefined)).toBe(80);
    expect(taxableEarningsAnchor(125, 100, 100, 500)).toBe(80);
    expect(taxableEarningsAnchor(125, 100, 0, undefined)).toBe(0);
    expect(taxableEarningsAnchor(125, 100, undefined, 1.25)).toBe(80);
  });
  it.each([0, -1, NaN, Infinity, undefined])("rejects unwitnessed earnings at rate %s", (rate) => {
    expect(() => taxableEarningsAnchor(125, 100, undefined, rate)).toThrow(
      "Earnings exchange rate unavailable"
    );
  });
  it.each([-1, NaN, Infinity])("rejects corrupt witnessed amounts %s", (amount) => {
    expect(() => taxableEarningsAnchor(125, 100, amount, 1)).toThrow(
      "Invalid recorded earnings anchor"
    );
  });
});
