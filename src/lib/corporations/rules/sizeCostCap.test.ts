import { describe, expect, it } from "vitest";
import { capSizeCosts, SIZE_COST_CAP_PP } from "./sizeCostCap";

describe("capSizeCosts", () => {
  it("leaves size costs under the cap untouched", () => {
    expect(capSizeCosts({ sprawl: -1, overhead: -3, dominance: -2 })).toEqual({
      sprawl: -1,
      overhead: -3,
      dominance: -2,
    });
  });

  it("scales all three down together to the cap", () => {
    const out = capSizeCosts({ sprawl: -3.8, overhead: -5.3, dominance: -2.9 });
    expect(out.sprawl + out.overhead + out.dominance).toBeCloseTo(-SIZE_COST_CAP_PP);
    expect(out.overhead / out.sprawl).toBeCloseTo(5.3 / 3.8);
  });

  it("ignores positive or non-finite inputs", () => {
    expect(capSizeCosts({ sprawl: 2, overhead: Number.NaN, dominance: -1 })).toEqual({
      sprawl: 0,
      overhead: 0,
      dominance: -1,
    });
  });
});
