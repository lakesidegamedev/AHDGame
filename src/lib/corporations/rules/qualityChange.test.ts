import { describe, expect, it } from "vitest";
import {
  lastQualityChange,
  lastQualityChangeFromHistory,
  qualityPillarsView,
} from "./qualityChange";

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

describe("qualityPillarsView", () => {
  const p = (tech: number, inputs: number) => ({ tech, inputs, wages: 50, operations: 50 });
  it("shows the newest row's pillars even when no older row has them", () => {
    const view = qualityPillarsView([{ turn: 165, qualityPillars: p(63, 56) }, { turn: 164 }]);
    expect(view?.pillars.tech).toBe(63);
    expect(view?.mover).toBeUndefined();
    expect(view?.previousTurn).toBeUndefined();
  });
  it("names the mover against the next older row with pillars", () => {
    const view = qualityPillarsView([
      { turn: 165, qualityPillars: p(63, 50) },
      { turn: 164 },
      { turn: 163, qualityPillars: p(63, 56) },
    ]);
    expect(view?.previousTurn).toBe(163);
    expect(view?.mover).toEqual({ key: "inputs", delta: -6 });
  });
  it("is absent when the newest row has no pillars", () => {
    expect(
      qualityPillarsView([{ turn: 165 }, { turn: 164, qualityPillars: p(1, 1) }])
    ).toBeUndefined();
  });
});
