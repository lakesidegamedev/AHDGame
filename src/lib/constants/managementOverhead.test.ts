import { describe, expect, it } from "vitest";
import { MANAGEMENT_OVERHEAD_FREE_PLANTS, managementOverheadPp } from "./corporations";

describe("managementOverheadPp", () => {
  it("is off when the knob is zero or the corp is at or under the free plant count", () => {
    expect(managementOverheadPp(1_000_000, 0)).toBe(0);
    expect(managementOverheadPp(MANAGEMENT_OVERHEAD_FREE_PLANTS, 0.5)).toBe(0);
    expect(managementOverheadPp(44, 0.5)).toBe(0);
    expect(managementOverheadPp(Number.NaN, 0.5)).toBe(0);
  });

  it("charges the knob per doubling above the free plant count", () => {
    expect(managementOverheadPp(MANAGEMENT_OVERHEAD_FREE_PLANTS * 2, 0.5)).toBeCloseTo(0.5);
    expect(managementOverheadPp(MANAGEMENT_OVERHEAD_FREE_PLANTS * 8, 0.5)).toBeCloseTo(1.5);
    // Live turn 332: the largest corp (691,180 plants) pays about 5.6pp.
    expect(managementOverheadPp(691_180, 0.5)).toBeCloseTo(5.58, 1);
  });
});
