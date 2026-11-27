import { describe, expect, it } from "vitest";
import { allocateReservedPayouts } from "./reservedPayouts";
describe("reserved buyout payouts", () => {
  it("does not overpay many independently rounded claims", () => {
    const payouts = allocateReservedPayouts(Array(101).fill(0.6), 60);
    expect(payouts.reduce((sum, n) => sum + n, 0)).toBe(60);
    expect(payouts.every((n) => n === 0 || n === 1)).toBe(true);
  });
  it("scales increased holdings down to the reserve deterministically", () => {
    expect(allocateReservedPayouts([100, 100, 100], 100)).toEqual([34, 33, 33]);
  });
  it("handles large balances and leaves an unused reserve refundable", () => {
    expect(allocateReservedPayouts([2e12, 1e12], 4e12)).toEqual([2e12, 1e12]);
    expect(allocateReservedPayouts([2e12, 1e12], 1e12).reduce((a, b) => a + b, 0)).toBe(1e12);
    expect(allocateReservedPayouts([0, 0], 100)).toEqual([0, 0]);
  });
  it("rejects corrupt inputs before cash changes", () => {
    expect(() => allocateReservedPayouts([NaN], 100)).toThrow();
    expect(() => allocateReservedPayouts([1], -1)).toThrow();
  });
});
