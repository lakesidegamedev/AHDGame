import { describe, expect, it } from "vitest";
import { auctionEscrowRefundLocal } from "./auctionEscrow";
describe("auction escrow denomination", () => {
  it("preserves anchor value across a moved corporate wallet", () => {
    expect(auctionEscrowRefundLocal(50, 1, 100)).toBe(5000);
    expect(auctionEscrowRefundLocal(5000, 100, 2)).toBe(100);
  });
  it.each([0, -1, NaN, Infinity])("refuses an unavailable quote %s", (rate) => {
    expect(() => auctionEscrowRefundLocal(50, rate, 1)).toThrow();
    expect(() => auctionEscrowRefundLocal(50, 1, rate)).toThrow();
  });
});
