import { describe, expect, it } from "vitest";
import { maturityLadderHighlights, sovereignMaturityLadder } from "./maturityLadder";

const bond = (principal: number, couponRatePct: number, maturityTurn: number) => ({
  principal,
  couponRatePct,
  maturityTurn,
});

describe("sovereignMaturityLadder", () => {
  it("totals coupons across every rung and the later bucket so they equal the interest charged", () => {
    const ladder = sovereignMaturityLadder(
      [bond(1_000, 2, 110), bond(1_000, 6, 100 + 48 * 9)],
      { currentTurn: 100, todayRatePct: 5, horizonYears: 6 }
    );
    expect(ladder.beyondCouponCost).toBeCloseTo(60, 10);
    expect(ladder.totalCouponCost).toBeCloseTo(80, 10);
    const rungs = ladder.years.reduce((sum, year) => sum + year.couponCost, 0);
    expect(rungs + ladder.beyondCouponCost).toBeCloseTo(ladder.totalCouponCost, 10);
    expect(ladder.averageCouponPct).toBeCloseTo(4, 10);
  });

  it("buckets by fiscal year from the current turn", () => {
    const ladder = sovereignMaturityLadder(
      [bond(100, 2, 110), bond(200, 3, 148), bond(300, 4, 260)],
      { currentTurn: 100, todayRatePct: 5 }
    );
    expect(ladder.years[0].principal).toBe(100); // within the current fiscal year
    expect(ladder.years[1].principal).toBe(200);
    expect(ladder.years[3].principal).toBe(300);
    expect(ladder.totalPrincipal).toBe(600);
  });

  it("prices each year's face at its coupon and at today's rate", () => {
    const ladder = sovereignMaturityLadder([bond(1_000, 2, 110)], {
      currentTurn: 100,
      todayRatePct: 5,
    });
    expect(ladder.years[0].couponCost).toBeCloseTo(20, 10);
    expect(ladder.years[0].repricedCost).toBeCloseTo(50, 10);
  });

  it("counts a bond already due into this fiscal year", () => {
    const ladder = sovereignMaturityLadder([bond(500, 3, 90)], {
      currentTurn: 100,
      todayRatePct: 4,
    });
    expect(ladder.years[0].principal).toBe(500);
  });

  it("reports face beyond the horizon separately instead of inflating the last year", () => {
    const ladder = sovereignMaturityLadder([bond(400, 3, 100 + 48 * 9)], {
      currentTurn: 100,
      todayRatePct: 4,
      horizonYears: 6,
    });
    expect(ladder.years[5].principal).toBe(0);
    expect(ladder.beyondPrincipal).toBe(400);
    expect(ladder.totalPrincipal).toBe(400);
  });

  it("reports each year's share of the outstanding stock", () => {
    const ladder = sovereignMaturityLadder([bond(250, 2, 110), bond(750, 2, 160)], {
      currentTurn: 100,
      todayRatePct: 5,
    });
    expect(ladder.years[0].share).toBeCloseTo(0.25, 10);
    expect(ladder.years[1].share).toBeCloseTo(0.75, 10);
  });

  it("reports the average coupon on a year's face and the gap to today's rate", () => {
    const ladder = sovereignMaturityLadder([bond(100, 2, 110), bond(300, 6, 120)], {
      currentTurn: 100,
      todayRatePct: 5,
    });
    expect(ladder.years[0].averageCouponPct).toBeCloseTo(5, 10);
    expect(ladder.years[0].repricingGapPct).toBeCloseTo(0, 10);
  });

  it("shows a positive gap where the stock reprices above its average coupon", () => {
    const ladder = sovereignMaturityLadder([bond(500, 1, 110)], {
      currentTurn: 100,
      todayRatePct: 4.5,
    });
    expect(ladder.years[0].averageCouponPct).toBeCloseTo(1, 10);
    expect(ladder.years[0].repricingGapPct).toBeCloseTo(3.5, 10);
  });

  it("ignores non-finite or non-positive rows", () => {
    const ladder = sovereignMaturityLadder(
      [bond(Number.NaN, 2, 110), bond(0, 2, 110), bond(100, Number.NaN, 110), bond(200, 2, 150)],
      { currentTurn: 100, todayRatePct: 5 }
    );
    expect(ladder.totalPrincipal).toBe(200);
  });

  it("handles an empty book", () => {
    const ladder = sovereignMaturityLadder([], { currentTurn: 100, todayRatePct: 5 });
    expect(ladder.totalPrincipal).toBe(0);
    expect(ladder.years.every((year) => year.share === 0)).toBe(true);
    expect(ladder.years.every((year) => year.averageCouponPct === 0)).toBe(true);
    expect(ladder.years.every((year) => year.repricingGapPct === 0)).toBe(true);
  });

  it("accepts a custom year length", () => {
    const ladder = sovereignMaturityLadder([bond(100, 2, 130)], {
      currentTurn: 100,
      todayRatePct: 5,
      turnsPerYear: 10,
    });
    expect(ladder.years[3].principal).toBe(100);
  });
});

describe("maturityLadderHighlights", () => {
  it("names the biggest share and the widest gap when they fall in different years", () => {
    const ladder = sovereignMaturityLadder(
      [bond(100, 4, 110), bond(700, 4.5, 160), bond(200, 1, 244)],
      { currentTurn: 100, todayRatePct: 5 }
    );

    const { largestShare, widestGap } = maturityLadderHighlights(ladder);

    expect(largestShare?.fyOffset).toBe(1);
    expect(widestGap?.fyOffset).toBe(3);
  });

  it("reports one year that carries both", () => {
    const ladder = sovereignMaturityLadder([bond(500, 1, 110)], {
      currentTurn: 100,
      todayRatePct: 5,
    });

    const { largestShare, widestGap } = maturityLadderHighlights(ladder);

    expect(largestShare?.fyOffset).toBe(0);
    expect(widestGap?.fyOffset).toBe(0);
  });

  it("does not call a year that reprices cheaper a widening gap", () => {
    // Coupons above today's rate: rolling over saves money, so there is no
    // cost to plan for even though the share is real.
    const ladder = sovereignMaturityLadder([bond(500, 6, 110)], {
      currentTurn: 100,
      todayRatePct: 5,
    });

    const { largestShare, widestGap } = maturityLadderHighlights(ladder);

    expect(largestShare?.fyOffset).toBe(0);
    expect(widestGap).toBeNull();
  });

  it("returns nothing to act on for an empty book", () => {
    const ladder = sovereignMaturityLadder([], { currentTurn: 100, todayRatePct: 5 });

    expect(maturityLadderHighlights(ladder)).toEqual({ largestShare: null, widestGap: null });
  });
});
