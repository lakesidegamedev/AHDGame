import { describe, expect, it } from "vitest";
import { createCrisisInstance } from "./instance";
import {
  applyTrackedSeverity,
  scriptedStageAt,
  scriptedStageBounds,
  scriptedStageRules,
} from "./scriptedPacing";
import { makeDefinition } from "./testFixtures";
import { STAGE_INDEX, type CrisisStage } from "./types";

function walk(duration: number | null, turns: number): CrisisStage[] {
  return Array.from({ length: turns }, (_, elapsed) => scriptedStageAt(elapsed, duration));
}

describe("scripted pacing", () => {
  it("resolves exactly when the scheduled length is reached", () => {
    for (const duration of [1, 2, 3, 8, 24, 60]) {
      expect(scriptedStageAt(duration - 1, duration)).not.toBe("resolved");
      expect(scriptedStageAt(duration, duration)).toBe("resolved");
    }
  });

  it("only ever moves forward through the stages", () => {
    for (const duration of [1, 2, 3, 5, 24, 100]) {
      const stages = walk(duration, duration + 3);
      for (let i = 1; i < stages.length; i++) {
        expect(STAGE_INDEX[stages[i]]).toBeGreaterThanOrEqual(STAGE_INDEX[stages[i - 1]]);
      }
    }
  });

  it("opens on signal and visits every stage on a full-length crisis", () => {
    const stages = new Set(walk(24, 24));
    expect([...stages].sort()).toEqual(["aftermath", "onset", "peak", "signal"]);
    expect(scriptedStageAt(0, 24)).toBe("signal");
  });

  it("holds an indefinite crisis at peak", () => {
    expect(walk(null, 5)).toEqual(["signal", "onset", "peak", "peak", "peak"]);
    expect(scriptedStageAt(10_000, null)).toBe("peak");
  });

  it("describes the same walk as stage rules", () => {
    const rules = scriptedStageRules(24);
    const total = Object.values(rules).reduce((sum, rule) => sum + rule.minTurns, 0);
    expect(total).toBe(24);
    expect(scriptedStageBounds(24)[3]).toBe(24);
  });

  it("pins tracked severity and keeps one history sample per turn", () => {
    const instance = createCrisisInstance(makeDefinition(), 3);
    const next = applyTrackedSeverity(instance, 140);
    expect(next.severity).toBe(100);
    expect(next.peakSeverity).toBe(100);
    expect(next.severityHistory).toHaveLength(1);
  });
});
