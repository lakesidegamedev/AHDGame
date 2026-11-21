import { describe, expect, it } from "vitest";
import { explainSovereignRate } from "@/lib/budget/rules/sovereignRate";
import {
  nominalGrowthFromReal,
  projectDebtPathHorizon,
} from "@/lib/budget/rules/sovereignDebtSustainability";
import { DEBT_OUTLOOK_HORIZON_YEARS, buildDebtOutlook } from "./debtOutlook";

const base = {
  debtToGdpRatio: 1.15,
  primaryBalanceToGdp: 0,
  realGrowthPct: 2,
  inflationPct: 2,
  investorConfidence: 80,
  imfBailoutActive: false,
};

describe("buildDebtOutlook", () => {
  it("reads the rate and trend from the shared breakdown", () => {
    const breakdown = explainSovereignRate(base);
    const outlook = buildDebtOutlook(base);
    expect(outlook).not.toBeNull();
    expect(outlook!.effectiveRatePct).toBeCloseTo(breakdown.effectiveRate * 100, 10);
    expect(outlook!.trajectory).toBe("rising");
    expect(outlook!.stabilisingPrimaryBalancePct).toBeCloseTo(
      breakdown.path.stabilisingPrimaryBalanceToGdp * 100,
      10
    );
    expect(outlook!.basisRatePct).toBeCloseTo(breakdown.afterImfCapRate * 100, 10);
  });

  it("projects the same chained path the budget chart draws", () => {
    const breakdown = explainSovereignRate(base);
    const horizon = projectDebtPathHorizon(
      {
        debtToGdp: base.debtToGdpRatio,
        primaryBalanceToGdp: base.primaryBalanceToGdp,
        nominalGrowthPct: nominalGrowthFromReal(base.realGrowthPct, base.inflationPct),
        interestRatePct: breakdown.afterImfCapRate * 100,
      },
      DEBT_OUTLOOK_HORIZON_YEARS
    );
    const outlook = buildDebtOutlook(base)!;
    expect(outlook.projectedDebtToGdpPct).toBeCloseTo(
      horizon[horizon.length - 1].debtToGdp * 100,
      10
    );
    expect(outlook.projectedDebtToGdpPct).toBeGreaterThan(base.debtToGdpRatio * 100);
  });

  it("reports a falling ratio when growth outruns the ladder rate", () => {
    // At 100% of GDP the ladder charges 3.5%, well under 6% nominal growth.
    const outlook = buildDebtOutlook({ ...base, debtToGdpRatio: 1, realGrowthPct: 4 })!;
    expect(outlook.trajectory).toBe("falling");
    expect(outlook.stabilisingPrimaryBalancePct).toBeLessThan(0);
  });

  it("calls a change inside the noise band stable", () => {
    // 3.5% against 4% nominal growth shaves less than half a point of GDP.
    const outlook = buildDebtOutlook({ ...base, debtToGdpRatio: 1, realGrowthPct: 2 })!;
    expect(outlook.trajectory).toBe("stable");
  });

  it("returns null without a debt ratio", () => {
    expect(buildDebtOutlook({ ...base, debtToGdpRatio: 0 })).toBeNull();
    expect(buildDebtOutlook({ ...base, debtToGdpRatio: Number.NaN })).toBeNull();
  });
});
