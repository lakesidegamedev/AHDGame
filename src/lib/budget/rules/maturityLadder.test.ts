import { describe, expect, it } from "vitest";
import { sovereignMaturityLadder } from "./maturityLadder";

const bond = (principal: number, couponRatePct: number, maturityTurn: number) => ({
  principal,
  couponRatePct,
  maturityTurn,
});

describe("sovereignMaturityLadder", () => {
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
