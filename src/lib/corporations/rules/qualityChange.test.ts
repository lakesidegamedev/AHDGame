import { describe, expect, it } from "vitest";
import { lastQualityChange, lastQualityChangeFromHistory } from "./qualityChange";

describe("lastQualityChange", () => {
  it("reports the drop against the newest snapshot that differs", () => {
    const change = lastQualityChange(56, [
      { turn: 161, value: 56.2 },
      { turn: 160, value: 79 },
    ]);
    expect(change).toEqual({ from: 79, fromTurn: 160, delta: -23 });
  });

  it("is null when quality has not moved by a visible amount", () => {
    expect(lastQualityChange(79, [{ turn: 160, value: 79.4 }])).toBeNull();
    expect(lastQualityChange(79, [])).toBeNull();
  });
});

describe("pillar attribution", () => {
  const before = { tech: 50, inputs: 60, wages: 50, operations: 40 };
  it("names the pillar that moved most when both snapshots recorded pillars", () => {
    const change = lastQualityChangeFromHistory(56, [
      { turn: 161, averageQuality: 56, qualityPillars: { ...before, inputs: 20, wages: 45 } },
      { turn: 160, averageQuality: 79, qualityPillars: before },
    ]);
    expect(change?.biggestPillar).toEqual({ key: "inputs", delta: -40 });
  });
  it("keeps the plain change when an older row has no pillars", () => {
    const change = lastQualityChangeFromHistory(56, [
      { turn: 161, averageQuality: 56, qualityPillars: before },
      { turn: 160, averageQuality: 79 },
    ]);
    expect(change).toEqual({ from: 79, fromTurn: 160, delta: -23 });
  });
});
