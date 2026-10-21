import { describe, expect, it } from "vitest";
import { appliedDominanceMarginPenalty } from "./dominanceRunningCost";

const base = {
  nationalSharePct: 100,
  shield: 0,
  plantsEnabled: true,
  plantsRampLambda: 1,
  runningScale: 0,
};

describe("appliedDominanceMarginPenalty", () => {
  it("is zero on a fully ramped plants world with the running cost off", () => {
    expect(appliedDominanceMarginPenalty({ ...base, localSharePct: 100 })).toBeCloseTo(0, 10);
  });

  it("charges the running scale of the full penalty at full share", () => {
    const full = appliedDominanceMarginPenalty({
      ...base,
      localSharePct: 100,
      plantsEnabled: false,
    });
    const half = appliedDominanceMarginPenalty({ ...base, localSharePct: 100, runningScale: 0.5 });
    expect(full).toBeLessThan(0);
    expect(half).toBeCloseTo(full / 2, 10);
  });

  it("fades toward zero as share falls to the threshold", () => {
    const local = (pct: number) =>
      appliedDominanceMarginPenalty({
        ...base,
        localSharePct: pct,
        nationalSharePct: 0,
        runningScale: 1,
      });
    expect(Math.abs(local(90))).toBeGreaterThan(Math.abs(local(70)));
    expect(local(50)).toBeCloseTo(0, 10);
    // The national leg starts lower, at 30 percent of a whole nation.
    const national = (pct: number) =>
      appliedDominanceMarginPenalty({
        ...base,
        localSharePct: 0,
        nationalSharePct: pct,
        runningScale: 1,
      });
    expect(Math.abs(national(60))).toBeGreaterThan(Math.abs(national(40)));
    expect(national(30)).toBeCloseTo(0, 10);
  });

  it("is cut by the tech shield", () => {
    const open = appliedDominanceMarginPenalty({ ...base, localSharePct: 100, runningScale: 1 });
    const shielded = appliedDominanceMarginPenalty({
      ...base,
      localSharePct: 100,
      runningScale: 1,
      shield: 0.5,
    });
    expect(shielded).toBeCloseTo(open / 2, 10);
  });
});
