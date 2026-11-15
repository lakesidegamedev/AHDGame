import { describe, expect, it } from "vitest";
import { getSovereignCouponRate } from "../sovereign";
import {
  debtManagerMaturityMix,
  debtManagerTilt,
  presetUsesLongSovereignTenors,
  sovereignIssuanceMaturities,
  weightedAverageMaturityTurns,
} from "./sovereignTenors";

const sum = (mix: Record<string, number | undefined>) =>
  Object.values(mix).reduce<number>((total, share) => total + (share ?? 0), 0);

describe("long sovereign tenors opt-in", () => {
  it("opens 10 and 30 year paper only in the 2027 preset", () => {
    expect(presetUsesLongSovereignTenors("2027-default")).toBe(true);
    expect(presetUsesLongSovereignTenors("2019-default")).toBe(false);
    expect(presetUsesLongSovereignTenors(undefined)).toBe(false);
    expect(sovereignIssuanceMaturities(false)).toEqual([48, 96, 240]);
    expect(sovereignIssuanceMaturities(true)).toEqual([48, 96, 240, 480, 1440]);
  });

  it("prices longer paper with a rising term premium", () => {
    const five = getSovereignCouponRate(3, 240);
    const ten = getSovereignCouponRate(3, 480);
    const thirty = getSovereignCouponRate(3, 1440);
    expect(ten).toBeGreaterThan(five);
    expect(thirty).toBeGreaterThan(ten);
    expect(ten).toBeCloseTo(4.25, 2);
    expect(thirty).toBeCloseTo(4.75, 2);
  });
});

describe("debt manager maturity mix", () => {
  const history = Array.from({ length: 96 }, () => 4);

  it("has no tilt without history or at the historical mean", () => {
    expect(debtManagerTilt(2, [])).toBe(0);
    expect(debtManagerTilt(4, history)).toBe(0);
  });

  it("tilts long when rates are low against history and short when high, capped", () => {
    expect(debtManagerTilt(3, history)).toBeCloseTo(0.5, 5);
    expect(debtManagerTilt(0, history)).toBe(1);
    expect(debtManagerTilt(5, history)).toBeCloseTo(-0.5, 5);
    expect(debtManagerTilt(10, history)).toBe(-1);
  });

  it("lengthens maturity when rates are low and shortens it when high", () => {
    const low = debtManagerMaturityMix({ currentRate: 1.5, rateHistory: history });
    const neutral = debtManagerMaturityMix({ currentRate: 4, rateHistory: history });
    const high = debtManagerMaturityMix({ currentRate: 7, rateHistory: history });
    expect(weightedAverageMaturityTurns(low)).toBeGreaterThan(
      weightedAverageMaturityTurns(neutral)
    );
    expect(weightedAverageMaturityTurns(neutral)).toBeGreaterThan(
      weightedAverageMaturityTurns(high)
    );
    expect(low[1440]).toBeGreaterThan(neutral[1440] ?? 0);
    expect(high[1440]).toBeUndefined();
  });

  it("always sums to one across every rung it issues", () => {
    for (const rate of [0, 1.3, 2.7, 4, 5.1, 6.66, 12]) {
      const mix = debtManagerMaturityMix({ currentRate: rate, rateHistory: history });
      expect(sum(mix)).toBeCloseTo(1, 9);
      for (const turns of Object.keys(mix)) {
        expect([48, 96, 240, 480, 1440]).toContain(Number(turns));
      }
    }
  });

  it("ignores non-finite history points", () => {
    expect(debtManagerTilt(3, [4, Number.NaN, 4])).toBeCloseTo(0.5, 5);
  });
});
