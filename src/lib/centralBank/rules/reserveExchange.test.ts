import { describe, expect, it } from "vitest";
import { reserveExchangeQuote } from "./reserveExchange";
describe("reserve exchange denominations", () => {
  it("converts a foreign spread to home units before rounding", () => {
    expect(reserveExchangeQuote(100000, 100, 1, 1)).toMatchObject({
      spreadFee: 1000,
      receivedAmount: 990,
      revenueHome: 5,
    });
    expect(reserveExchangeQuote(100000, 100, 1, 100)).toMatchObject({ revenueHome: 500 });
    expect(reserveExchangeQuote(100, 1, 0.75, 1)).toMatchObject({
      receivedAmount: 74,
      revenueHome: 0,
    });
  });
  it.each([0, -1, NaN, Infinity])("rejects unusable rate %s", (rate) => {
    expect(reserveExchangeQuote(100000, rate, 1, 1)).toBeNull();
    expect(reserveExchangeQuote(100000, 100, rate, 1)).toBeNull();
    expect(reserveExchangeQuote(100000, 100, 1, rate)).toBeNull();
  });
  it("refuses a rounded-to-zero exchange and unsafe integral outcomes", () => {
    expect(reserveExchangeQuote(1, 100, 1, 1)).toBeNull();
    expect(reserveExchangeQuote(Number.MAX_SAFE_INTEGER, 1, 1000, 1)).toBeNull();
  });
});
