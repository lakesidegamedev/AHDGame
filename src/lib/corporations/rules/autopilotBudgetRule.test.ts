import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_BUDGET_SHARES,
  autopilotBudgetBand,
  buildAutopilotBudgetChanges,
} from "./autopilotBudgetRule";

describe("autopilotBudgetBand", () => {
  it("maps margin to the band", () => {
    expect(autopilotBudgetBand({ distressed: true, marginPct: 40 })).toBe("distress");
    expect(autopilotBudgetBand({ distressed: false, marginPct: 9.9 })).toBe("thin");
    expect(autopilotBudgetBand({ distressed: false, marginPct: 10 })).toBe("healthy");
    expect(autopilotBudgetBand({ distressed: false, marginPct: 24.9 })).toBe("healthy");
    expect(autopilotBudgetBand({ distressed: false, marginPct: 25 })).toBe("strong");
  });
  it("healthy band with the cautious 0.8 multiplier gives 2.4 / 2.0 / 0.8 percent", () => {
    const s = AUTOPILOT_BUDGET_SHARES.healthy;
    expect(s.marketing * 0.8).toBeCloseTo(0.024);
    expect(s.logistics).toBe(0.02);
    expect(s.rd * 0.8).toBeCloseTo(0.008);
  });
});

describe("buildAutopilotBudgetChanges", () => {
  it("records only changed levers with the share of revenue", () => {
    expect(
      buildAutopilotBudgetChanges({
        turn: 162,
        revenue: 1000,
        current: { marketing: 24, logistics: 20, rd: 5 },
        next: { marketing: 24, logistics: 21, rd: 8 },
      })
    ).toEqual({
      logistics: { turn: 162, from: 20, to: 21, pctOfRevenue: 0.021 },
      rd: { turn: 162, from: 5, to: 8, pctOfRevenue: 0.008 },
    });
  });
});
