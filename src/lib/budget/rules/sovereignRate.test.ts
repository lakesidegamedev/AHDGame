import { describe, expect, it } from "vitest";
import { IMF_SOVEREIGN_DEFAULT_RATE } from "@/lib/sovereignDefault/constants";
import {
  MAX_SOVEREIGN_RATE,
  calculateInterestRate,
  explainSovereignRate,
  getSovereignConfidencePremium,
} from "./sovereignRate";
import { nominalGrowthFromReal, projectDebtPath } from "./sovereignDebtSustainability";

const base = {
  debtToGdpRatio: 0.82,
  primaryBalanceToGdp: 0,
  realGrowthPct: 2,
  inflationPct: 2,
  investorConfidence: 80,
  imfBailoutActive: false,
};

describe("explainSovereignRate", () => {
  it("attributes the rate to ladder, confidence and trajectory", () => {
    // 115% of GDP sits on BBB (5%) and the ratio is climbing, so the trajectory
    // premium is outside the noise band and visible.
    const r = explainSovereignRate({ ...base, debtToGdpRatio: 1.15 });
    expect(r.ladderRate).toBeCloseTo(0.05, 10);
    expect(r.ladderRating).toBe("BBB");
    expect(r.confidencePremium).toBe(0);
    expect(r.trajectoryPremium).toBeGreaterThan(0);
    expect(r.trajectoryPremium).toBeCloseTo(r.path.changeToGdp * 0.1, 10);
    expect(r.effectiveRate).toBeCloseTo(0.05 + r.trajectoryPremium, 10);
  });

  it("adds a confidence premium below the baseline and none at or above it", () => {
    const low = explainSovereignRate({ ...base, investorConfidence: 0 });
    expect(low.confidencePremium).toBeCloseTo(0.03, 10);
    const atBaseline = explainSovereignRate({ ...base, investorConfidence: 70 });
    expect(atBaseline.confidencePremium).toBe(0);
    const above = explainSovereignRate({ ...base, investorConfidence: 95 });
    expect(above.confidencePremium).toBe(0);
    expect(getSovereignConfidencePremium(Number.NaN)).toBe(0);
  });

  it("shows the IMF programme capping the ladder", () => {
    // 300% of GDP sits on the CCC tier, well above the 6% facility rate.
    const r = explainSovereignRate({ ...base, debtToGdpRatio: 3, imfBailoutActive: true });
    expect(r.ladderRate).toBeCloseTo(0.14, 10);
    expect(r.imfCapApplied).toBe(true);
    expect(r.afterImfCapRate).toBe(IMF_SOVEREIGN_DEFAULT_RATE);
    expect(calculateInterestRate(3, true)).toBe(IMF_SOVEREIGN_DEFAULT_RATE);
  });

  it("does not claim an IMF cap when the ladder is already cheaper", () => {
    const r = explainSovereignRate({ ...base, debtToGdpRatio: 0.3, imfBailoutActive: true });
    expect(r.imfCapApplied).toBe(false);
    expect(r.afterImfCapRate).toBe(r.ladderRate);
  });

  it("keeps the worst realistic stack under the hard ceiling", () => {
    // Top ladder 14%, maximum confidence premium 3 points, trajectory cap 2.
    const r = explainSovereignRate({
      ...base,
      debtToGdpRatio: 4,
      inflationPct: -10,
      investorConfidence: 0,
      imfBailoutActive: false,
    });
    expect(r.ladderRate).toBeCloseTo(0.14, 10);
    expect(r.confidencePremium).toBeCloseTo(0.03, 10);
    expect(r.maxCapApplied).toBe(false);
    expect(r.effectiveRate).toBeCloseTo(r.uncappedRate, 10);
    expect(r.effectiveRate).toBeLessThan(MAX_SOVEREIGN_RATE);
  });

  it("reads the stabilising balance off the ladder rate, not the premium-loaded one", () => {
    // 115% of GDP: the ladder is 5% but the effective rate carries both a
    // trajectory premium and confidence cost, so the two bases differ.
    const r = explainSovereignRate({ ...base, debtToGdpRatio: 1.15, investorConfidence: 0 });
    expect(r.effectiveRate).toBeGreaterThan(r.afterImfCapRate);
    const ladderBasis = projectDebtPath({
      debtToGdp: 1.15,
      primaryBalanceToGdp: 0,
      nominalGrowthPct: nominalGrowthFromReal(2, 2),
      interestRatePct: r.afterImfCapRate * 100,
    });
    expect(r.path.stabilisingPrimaryBalanceToGdp).toBeCloseTo(
      ladderBasis.stabilisingPrimaryBalanceToGdp,
      12
    );
    const effectiveBasis = projectDebtPath({
      debtToGdp: 1.15,
      primaryBalanceToGdp: 0,
      nominalGrowthPct: nominalGrowthFromReal(2, 2),
      interestRatePct: r.effectiveRate * 100,
    });
    expect(effectiveBasis.stabilisingPrimaryBalanceToGdp).toBeGreaterThan(
      r.path.stabilisingPrimaryBalanceToGdp
    );
  });

  it("never returns a negative effective rate", () => {
    const r = explainSovereignRate({
      ...base,
      debtToGdpRatio: 0.1,
      primaryBalanceToGdp: 0.5,
      inflationPct: 15,
      investorConfidence: 80,
    });
    expect(r.effectiveRate).toBeGreaterThanOrEqual(0);
  });
});
