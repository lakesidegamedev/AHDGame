import { describe, expect, it } from "vitest";
import { estimateDriverPressure, forecastDoNothing, severityTrend } from "./forecast";
import { makeDefinition } from "./testFixtures";
import type { AccountabilityEntry } from "./types";

const def = makeDefinition();

function instance(overrides: Record<string, unknown> = {}) {
  return {
    stage: "onset" as const,
    severity: 24,
    idleTurns: 0,
    leverLastUsed: {},
    severityHistory: [
      { turn: 1, severity: 20 },
      { turn: 2, severity: 24 },
    ],
    ledger: [] as AccountabilityEntry[],
    ...overrides,
  };
}

describe("estimateDriverPressure", () => {
  it("is zero without two samples", () => {
    expect(estimateDriverPressure(def, instance({ severityHistory: [] }))).toBe(0);
  });

  it("reads back what moved severity beyond decay and escalation", () => {
    expect(estimateDriverPressure(def, instance())).toBe(4);
  });

  it("adds back mitigation that counted on the last turn", () => {
    const acted = instance({
      severity: 18,
      severityHistory: [
        { turn: 1, severity: 20 },
        { turn: 2, severity: 18 },
      ],
      ledger: [
        {
          turn: 2,
          stage: "onset",
          role: "headOfState",
          holderId: "a",
          leverId: "stimulus",
          cost: {},
          mitigation: 6,
          severity: 20,
        },
      ],
    });
    expect(estimateDriverPressure(def, acted)).toBe(4);
  });
});

describe("forecastDoNothing", () => {
  it("projects steady pressure plus growing inaction escalation", () => {
    expect(forecastDoNothing(def, instance(), 2, 3)).toEqual([28, 34, 41]);
  });

  it("stays within the severity scale", () => {
    const path = forecastDoNothing(def, instance({ severity: 95 }), 2, 6);
    expect(Math.max(...path)).toBeLessThanOrEqual(100);
  });

  it("falls with aftermath decay when pressure is gone", () => {
    const fading = instance({
      stage: "aftermath",
      severity: 30,
      severityHistory: [
        { turn: 1, severity: 33 },
        { turn: 2, severity: 30 },
      ],
    });
    expect(forecastDoNothing(def, fading, 2, 2)).toEqual([27, 24]);
  });
});

describe("severityTrend", () => {
  it("reads direction and treats small moves as steady", () => {
    expect(severityTrend([10, 14, 20])).toBe("rising");
    expect(severityTrend([30, 25, 20])).toBe("falling");
    expect(severityTrend([30, 30.4])).toBe("steady");
    expect(severityTrend([30])).toBe("steady");
  });
});
