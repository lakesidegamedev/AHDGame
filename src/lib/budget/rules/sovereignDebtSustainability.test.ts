import { describe, expect, it } from "vitest";
import {
  STABLE_TRAJECTORY_BAND,
  TRAJECTORY_PREMIUM_MAX,
  TRAJECTORY_PREMIUM_MIN,
  debtSustainabilityPremium,
  describeDebtPath,
  nominalGrowthFromReal,
  projectDebtPath,
  projectDebtPathHorizon,
} from "./sovereignDebtSustainability";

const base = {
  debtToGdp: 1.2,
  primaryBalanceToGdp: 0,
  nominalGrowthPct: 2,
  interestRatePct: 5,
};

describe("projectDebtPath", () => {
  it("projects the ratio with the debt-dynamics identity", () => {
    const path = projectDebtPath(base);
    // ((1.05 / 1.02) * 1.2) - 0 = 1.235294...
    expect(path.projectedDebtToGdp).toBeCloseTo(1.23529, 4);
    expect(path.changeToGdp).toBeCloseTo(0.03529, 4);
  });

  it("reports the primary balance that holds the ratio flat", () => {
    const path = projectDebtPath(base);
    // (1.05 / 1.02 - 1) * 1.2 = 0.035294...
    expect(path.stabilisingPrimaryBalanceToGdp).toBeCloseTo(0.03529, 4);
    const held = projectDebtPath({
      ...base,
      primaryBalanceToGdp: path.stabilisingPrimaryBalanceToGdp,
    });
    expect(held.changeToGdp).toBeCloseTo(0, 6);
    expect(held.trajectory).toBe("stable");
  });

  it("falls when the primary surplus beats the interest-growth gap", () => {
    const path = projectDebtPath({ ...base, primaryBalanceToGdp: 0.05 });
    expect(path.trajectory).toBe("falling");
    expect(path.changeToGdp).toBeLessThan(-STABLE_TRAJECTORY_BAND);
  });

  it("rises when debt rolls over at a rate above growth", () => {
    expect(projectDebtPath(base).trajectory).toBe("rising");
  });

  it("is stable when the rate matches growth and the primary balance is zero", () => {
    expect(projectDebtPath({ ...base, interestRatePct: 2, nominalGrowthPct: 2 }).trajectory).toBe(
      "stable"
    );
  });

  it("lets a country with growth above its rate run a primary deficit and still fall", () => {
    const path = projectDebtPath({
      ...base,
      interestRatePct: 1,
      nominalGrowthPct: 4,
      primaryBalanceToGdp: -0.02,
    });
    expect(path.stabilisingPrimaryBalanceToGdp).toBeLessThan(0);
    expect(path.trajectory).toBe("falling");
  });

  it("ignores a change inside the noise band", () => {
    const path = projectDebtPath({ ...base, debtToGdp: 0.1, interestRatePct: 3 });
    expect(Math.abs(path.changeToGdp)).toBeLessThanOrEqual(STABLE_TRAJECTORY_BAND);
    expect(path.trajectory).toBe("stable");
  });

  it("never reports negative debt", () => {
    const path = projectDebtPath({
      debtToGdp: 0.1,
      primaryBalanceToGdp: 0.5,
      nominalGrowthPct: 2,
      interestRatePct: 2,
    });
    expect(path.projectedDebtToGdp).toBe(0);
    expect(path.trajectory).toBe("falling");
  });

  it("survives non-finite inputs without producing NaN", () => {
    const path = projectDebtPath({
      debtToGdp: Number.NaN,
      primaryBalanceToGdp: Number.NaN,
      nominalGrowthPct: Number.NaN,
      interestRatePct: Number.NaN,
    });
    expect(path.changeToGdp).toBe(0);
    expect(path.projectedDebtToGdp).toBe(0);
    expect(path.trajectory).toBe("stable");
  });

  it("clamps an implausible growth collapse instead of dividing toward infinity", () => {
    const path = projectDebtPath({ ...base, nominalGrowthPct: -100 });
    expect(Number.isFinite(path.projectedDebtToGdp)).toBe(true);
  });
});

describe("nominalGrowthFromReal", () => {
  it("passes real growth through when there is no inflation", () => {
    expect(nominalGrowthFromReal(2, 0)).toBe(2);
    expect(nominalGrowthFromReal(2, null)).toBe(2);
  });

  it("turns real growth into nominal growth by adding inflation", () => {
    expect(nominalGrowthFromReal(2, 3)).toBe(5);
    expect(nominalGrowthFromReal(-1, 2.5)).toBe(1.5);
  });

  it("counts inflation on its own when real growth is flat", () => {
    expect(nominalGrowthFromReal(0, 4)).toBe(4);
  });

  it("lets deflation lower nominal growth below real growth", () => {
    expect(nominalGrowthFromReal(1, -2)).toBe(-1);
    expect(nominalGrowthFromReal(2, -3)).toBe(-1);
  });

  it("charges a deflating country more than a flat-price one at the same real growth", () => {
    const deflating = projectDebtPath({
      debtToGdp: 1.2,
      primaryBalanceToGdp: 0,
      nominalGrowthPct: nominalGrowthFromReal(1, -2),
      interestRatePct: 5,
    });
    const flatPrices = projectDebtPath({
      debtToGdp: 1.2,
      primaryBalanceToGdp: 0,
      nominalGrowthPct: nominalGrowthFromReal(1, 0),
      interestRatePct: 5,
    });
    expect(deflating.changeToGdp).toBeGreaterThan(flatPrices.changeToGdp);
    expect(debtSustainabilityPremium(deflating)).toBeGreaterThan(
      debtSustainabilityPremium(flatPrices)
    );
  });

  it("treats non-finite readings as zero instead of poisoning the identity", () => {
    expect(nominalGrowthFromReal(Number.NaN, 3)).toBe(3);
    expect(nominalGrowthFromReal(2, Number.POSITIVE_INFINITY)).toBe(2);
    expect(nominalGrowthFromReal(undefined, undefined)).toBe(0);
  });

  // The regression this helper exists for: a country whose rate matches its
  // nominal growth is stable. Reading its real growth as nominal made every such
  // year look like a 2.9 point climb and charged the trajectory premium.
  it("keeps a ratio flat when the rate matches nominal growth, not real growth", () => {
    const nominal = nominalGrowthFromReal(2, 3);
    const stable = projectDebtPath({
      debtToGdp: 1.2,
      primaryBalanceToGdp: 0,
      nominalGrowthPct: nominal,
      interestRatePct: 5,
    });
    expect(stable.trajectory).toBe("stable");
    expect(debtSustainabilityPremium(stable)).toBe(0);

    const realOnly = projectDebtPath({
      debtToGdp: 1.2,
      primaryBalanceToGdp: 0,
      nominalGrowthPct: 2,
      interestRatePct: 5,
    });
    expect(realOnly.trajectory).toBe("rising");
    expect(debtSustainabilityPremium(realOnly)).toBeGreaterThan(0);
  });
});

describe("projectDebtPathHorizon", () => {
  const stable = {
    debtToGdp: 1.0,
    primaryBalanceToGdp: 0,
    nominalGrowthPct: 4,
    interestRatePct: 4,
  };

  it("starts today and ends at the requested horizon", () => {
    const points = projectDebtPathHorizon(stable, 5);
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ year: 0, debtToGdp: 1, changeToGdp: 0 });
    expect(points[5].year).toBe(5);
  });

  it("holds a ratio flat when the rate matches nominal growth and the balance is zero", () => {
    for (const point of projectDebtPathHorizon(stable, 5)) {
      expect(point.debtToGdp).toBeCloseTo(1, 6);
    }
  });

  it("compounds a gap year after year instead of repeating one year's change", () => {
    const points = projectDebtPathHorizon({ ...stable, interestRatePct: 9 }, 3);
    expect(points[1].debtToGdp).toBeGreaterThan(points[0].debtToGdp);
    expect(points[2].debtToGdp).toBeGreaterThan(points[1].debtToGdp);
    expect(points[3].debtToGdp).toBeGreaterThan(points[2].debtToGdp);
    expect(points[3].debtToGdp - points[2].debtToGdp).toBeGreaterThan(
      points[1].debtToGdp - points[0].debtToGdp
    );
  });

  it("brings the ratio down under a surplus", () => {
    const points = projectDebtPathHorizon({ ...stable, primaryBalanceToGdp: 0.03 }, 5);
    expect(points[5].debtToGdp).toBeLessThan(points[0].debtToGdp);
  });

  it("clamps an absurd horizon instead of looping unbounded", () => {
    expect(projectDebtPathHorizon(stable, 500)).toHaveLength(11);
    expect(projectDebtPathHorizon(stable, 0)).toHaveLength(2);
  });

  it("survives a non-finite start without producing NaN", () => {
    const points = projectDebtPathHorizon({ ...stable, debtToGdp: Number.NaN }, 2);
    for (const point of points) expect(Number.isFinite(point.debtToGdp)).toBe(true);
  });
});

describe("debtSustainabilityPremium", () => {
  it("charges nothing for a stable ratio", () => {
    const path = projectDebtPath({ ...base, interestRatePct: 2 });
    expect(path.trajectory).toBe("stable");
    expect(debtSustainabilityPremium(path)).toBe(0);
  });

  it("adds a premium proportional to how fast the ratio climbs", () => {
    const path = projectDebtPath(base);
    expect(debtSustainabilityPremium(path)).toBeCloseTo(path.changeToGdp * 0.1, 6);
  });

  it("discounts a ratio that is coming down", () => {
    const path = projectDebtPath({ ...base, primaryBalanceToGdp: 0.1 });
    expect(debtSustainabilityPremium(path)).toBeLessThan(0);
    expect(debtSustainabilityPremium(path)).toBeGreaterThanOrEqual(TRAJECTORY_PREMIUM_MIN);
  });

  it("caps a runaway ratio at the maximum premium", () => {
    const path = projectDebtPath({
      debtToGdp: 5,
      primaryBalanceToGdp: -0.2,
      nominalGrowthPct: -5,
      interestRatePct: 20,
    });
    expect(debtSustainabilityPremium(path)).toBe(TRAJECTORY_PREMIUM_MAX);
  });

  it("caps the discount so a fast deleveraging cannot make borrowing free", () => {
    const path = projectDebtPath({
      debtToGdp: 3,
      primaryBalanceToGdp: 0.5,
      nominalGrowthPct: 10,
      interestRatePct: 1,
    });
    expect(debtSustainabilityPremium(path)).toBe(TRAJECTORY_PREMIUM_MIN);
  });
});

describe("describeDebtPath", () => {
  it("names the direction", () => {
    expect(describeDebtPath(projectDebtPath(base))).toContain("rising");
    expect(describeDebtPath(projectDebtPath({ ...base, interestRatePct: 2 }))).toContain("stable");
    expect(describeDebtPath(projectDebtPath({ ...base, primaryBalanceToGdp: 0.1 }))).toContain(
      "falling"
    );
  });

  it("states the primary surplus needed to hold a rising ratio flat", () => {
    expect(describeDebtPath(projectDebtPath(base))).toContain("3.5% of GDP");
  });
});
