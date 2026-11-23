import { describe, expect, it } from "vitest";
import { buildScarcityBreakdown } from "./priceBreakdownRules";

const attribution = {
  appliedPrice: 3.59,
  realBasePrice: 1,
  nominalInflation: 0.2,
  scarcityMemory: 2.052,
  producerInputCostPassThrough: 0.34,
};

describe("buildScarcityBreakdown", () => {
  it("explains a high premium that is easing while supply exceeds demand", () => {
    const b = buildScarcityBreakdown({
      scarcityMult: 2.71,
      previousScarcityMult: 2.8,
      supply: 100,
      demand: 87.5,
      attribution,
    })!;
    expect(b.nominalBase).toBeCloseTo(1.2);
    expect(b.direction).toBe("easing");
    expect(b.scarcityChange).toBeCloseTo(-0.0321, 3);
    expect(b.pressure).toBe("supply-over-demand");
    expect(b.maxMovePerTurn).toBeCloseTo(0.06);
    expect(b.priceMultiple).toBeCloseTo(2.99, 1);
    expect(b.costPassThrough).toBeGreaterThan(1);
  });

  it("uses the configured pace and reports rising demand pressure", () => {
    const b = buildScarcityBreakdown({
      scarcityMult: 1.5,
      previousScarcityMult: 1.4,
      supply: 80,
      demand: 100,
      attribution,
      configuredMaxMove: 0.02,
    })!;
    expect(b.direction).toBe("rising");
    expect(b.pressure).toBe("demand-over-supply");
    expect(b.maxMovePerTurn).toBe(0.02);
  });

  it("has no change reading without a prior stored value, and no breakdown without data", () => {
    expect(
      buildScarcityBreakdown({
        scarcityMult: 1,
        previousScarcityMult: undefined,
        supply: 0,
        demand: 0,
        attribution,
      })!.direction
    ).toBe("unknown");
    expect(
      buildScarcityBreakdown({
        scarcityMult: undefined,
        previousScarcityMult: 1,
        supply: 1,
        demand: 1,
        attribution,
      })
    ).toBeNull();
  });
});

describe("tooltip helpers", () => {
  it("recovers the multiplier from stored attribution and words the trend", async () => {
    const { scarcityMultFromAttribution, premiumTrendSentence, balancePressure } =
      await import("./priceBreakdownRules");
    expect(
      scarcityMultFromAttribution({
        realBasePrice: 1,
        nominalInflation: 0.2,
        scarcityMemory: 2.052,
      })
    ).toBeCloseTo(2.71, 2);
    expect(scarcityMultFromAttribution(null)).toBeNull();
    expect(premiumTrendSentence(balancePressure(100, 87.5), 0.06)).toContain("eases by up to 6%");
    expect(premiumTrendSentence(balancePressure(80, 100), 0.06)).toContain("rises by up to 6%");
  });
});
