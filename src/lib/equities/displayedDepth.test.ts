import { describe, expect, it } from "vitest";
import { displayedMarketDepth } from "./displayedDepth";

describe("displayedMarketDepth", () => {
  it("never exceeds what exists", () => {
    expect(displayedMarketDepth(6_461_204, 598_685)).toBe(598_685);
    expect(displayedMarketDepth(2_002_088_600, 2_849)).toBe(2_849);
  });
  it("passes a smaller depth through and rejects bad input", () => {
    expect(displayedMarketDepth(100.9, 500)).toBe(100);
    expect(displayedMarketDepth(Number.NaN, 500)).toBe(0);
    expect(displayedMarketDepth(10, -1)).toBe(0);
  });
});
