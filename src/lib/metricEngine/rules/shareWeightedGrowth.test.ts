import { describe, expect, it } from "vitest";
import { shareWeightedGrowth } from "./shareWeightedGrowth";

describe("share-weighted regional growth", () => {
  it("credits owned-company growth only for the owned slice of the economy", () => {
    // Owned companies are 10% of the region and grew 15%; the rest grows 0.5%.
    expect(
      shareWeightedGrowth({
        ownedSignal: 15,
        backgroundRate: 0.5,
        ownedRevenue: 10,
        backgroundRevenue: 90,
      })
    ).toBeCloseTo(1.95, 6);
  });

  it("lets owned companies drive more as their share grows", () => {
    const small = shareWeightedGrowth({
      ownedSignal: 6,
      backgroundRate: 0.5,
      ownedRevenue: 5,
      backgroundRevenue: 95,
    });
    const large = shareWeightedGrowth({
      ownedSignal: 6,
      backgroundRate: 0.5,
      ownedRevenue: 60,
      backgroundRevenue: 40,
    });
    expect(large).toBeGreaterThan(small);
  });

  it("falls back to the owned signal when the economy has no measured revenue", () => {
    expect(
      shareWeightedGrowth({
        ownedSignal: 3,
        backgroundRate: 0.5,
        ownedRevenue: 0,
        backgroundRevenue: 0,
      })
    ).toBe(3);
  });
});
