import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import { loadResetMetricDisplay, overlayMetricValues } from "./resetMetricOverlay";

describe("overlayMetricValues", () => {
  it("fills a missing legacy doc from v2 readings", () => {
    const doc = overlayMetricValues(null, "CA_ON", {
      governance: { publicTrust: 46.3, corruptionIndex: 23 },
      mediaInformation: { pressFreedom: 80.2 },
    }) as unknown as Record<string, Record<string, { value: number }>>;
    expect(doc.governance.publicTrust.value).toBe(46.3);
    expect(doc.governance.corruptionIndex.value).toBe(23);
    expect(doc.mediaInformation.pressFreedom.value).toBe(80.2);
  });

  it("lets a v2 reading win and keeps legacy-only paths", () => {
    const legacy = {
      _id: "US_CA",
      governance: { publicTrust: { value: 10 }, budgetBalance: { value: 2 } },
      publicSafety: { publicSafetyConfidence: { value: 55 } },
    } as unknown as StateMetrics;
    const doc = overlayMetricValues(legacy, "US_CA", {
      governance: { publicTrust: 61 },
    }) as unknown as Record<string, Record<string, { value: number }>>;
    expect(doc.governance.publicTrust.value).toBe(61);
    expect(doc.governance.budgetBalance.value).toBe(2);
    expect(doc.publicSafety.publicSafetyConfidence.value).toBe(55);
    expect(
      (legacy as unknown as Record<string, Record<string, { value: number }>>).governance
        .publicTrust.value
    ).toBe(10);
  });

  it("returns the legacy doc untouched when there are no v2 readings", () => {
    const legacy = { _id: "UK_LON" } as unknown as StateMetrics;
    expect(overlayMetricValues(legacy, "UK_LON", null)).toBe(legacy);
    expect(overlayMetricValues(null, "UK_LON", {})).toBeNull();
  });
});

describe("loadResetMetricDisplay", () => {
  const db = {
    collection: () => {
      throw new Error("must not read boards outside Metrics v2");
    },
  } as unknown as Db;

  it("reads nothing for a world without Metrics v2", async () => {
    expect(await loadResetMetricDisplay(db, null, "CA")).toBeNull();
    expect(
      await loadResetMetricDisplay(
        db,
        { _id: "current", preset: "1991-default" } as unknown as GameState,
        "CA"
      )
    ).toBeNull();
  });

  it("reads nothing for a country outside Metrics v2", async () => {
    expect(
      await loadResetMetricDisplay(
        db,
        { _id: "current", resetWorldId: "w", metricsSystemVersion: "v2" } as unknown as GameState,
        "UK"
      )
    ).toBeNull();
  });
});
