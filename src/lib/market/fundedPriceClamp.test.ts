import { describe, expect, it } from "vitest";
import { clampFundedPrice } from "./fundedPriceClamp";

const PACE = { maxMove: 0.02, maxMultiplier: 3 };

describe("clampFundedPrice", () => {
  it("limits a rise to the configured move from last turn", () => {
    expect(clampFundedPrice(150, 100, 100, PACE)).toBe(102);
  });

  it("limits a fall the same way", () => {
    expect(clampFundedPrice(50, 100, 100, PACE)).toBe(98);
  });

  it("leaves a price inside the band alone", () => {
    expect(clampFundedPrice(101, 100, 100, PACE)).toBe(101);
  });

  it("never publishes above the multiplier ceiling", () => {
    expect(clampFundedPrice(400, 299, 100, PACE)).toBe(300);
  });

  it("applies only the ceiling when there is no prior price", () => {
    expect(clampFundedPrice(900, undefined, 100, PACE)).toBe(300);
  });
});
