import { describe, expect, it } from "vitest";
import { legacyProxyCatchUp } from "./legacyRecoveryCatchUp";
import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
function board(countryId: "US" | "UK" | "JP"): ResetMetricSnapshot {
  return {
    _id: countryId + ":region",
    worldId: "world",
    countryId,
    scope: "regional",
    regionId: "region",
    sourceTurn: 1,
    asOfTurn: 100,
    openingValues: { "26": 60 },
    observations: {
      "26": {
        metricId: "26",
        path: "infrastructure.roads",
        value: 60,
        status: "proxy",
        owner: "roads",
        source: "provisional continuity owner: roads",
        note: "Modeled",
      },
    },
  };
}
describe("bounded legacy catch-up", () => {
  it.each(["US", "UK", "JP"] as const)(
    "uses %s proxy rules and caps condition changes",
    (country) => {
      const result = legacyProxyCatchUp({
        board: board(country),
        metricId: "26",
        pressure: 1.2,
        verifiedTurns: 48,
        year: 1999,
      });
      expect(result).not.toBeNull();
      expect(result!.conditionDelta).toBeGreaterThan(0);
      expect(result!.conditionDelta).toBeLessThanOrEqual(2.00000001);
    }
  );
  it("does not change a measured owner or its history", () => {
    const b = board("US");
    b.observations["26"]!.status = "observed";
    const before = JSON.stringify(b);
    expect(
      legacyProxyCatchUp({ board: b, metricId: "26", pressure: 1, verifiedTurns: 48, year: 1999 })
    ).toBeNull();
    expect(JSON.stringify(b)).toBe(before);
  });
  it("does not change definition-v2 owners even if they are modeled", () => {
    const b = board("UK");
    b.observations["26"]!.definitionVersion = 2;
    expect(
      legacyProxyCatchUp({ board: b, metricId: "26", pressure: 1, verifiedTurns: 48, year: 1999 })
    ).toBeNull();
  });
  it("requires verified missed turns", () => {
    expect(
      legacyProxyCatchUp({
        board: board("JP"),
        metricId: "26",
        pressure: 1,
        verifiedTurns: 0,
        year: 1999,
      })
    ).toBeNull();
  });
  it("does not credit the natural baseline rebound as legislative work", () => {
    const b = board("US");
    b.observations["26"]!.value = 40;
    const result = legacyProxyCatchUp({
      board: b,
      metricId: "26",
      pressure: 0.01,
      verifiedTurns: 1,
      year: 1999,
    });
    expect(result?.conditionDelta).toBeGreaterThan(0);
    expect(result!.conditionDelta).toBeLessThan(0.1);
  });
});
