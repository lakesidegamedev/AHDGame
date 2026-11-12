import { describe, expect, it } from "vitest";
import { makeDefinition } from "./testFixtures";
import { createCrisisInstance } from "./instance";
import { applyTransition, nextStage, turnsInStage } from "./stageMachine";
import type { CrisisInstance, CrisisStage } from "./types";

const def = makeDefinition();

function at(stage: CrisisStage, stageStartTurn: number, extra: Partial<CrisisInstance> = {}) {
  return { ...createCrisisInstance(def, 0), stage, stageStartTurn, ...extra };
}

describe("nextStage", () => {
  it("holds a signal until its minimum turns pass", () => {
    expect(nextStage(at("signal", 10), def, 40, 10)).toMatchObject({ changed: false });
    expect(nextStage(at("signal", 10), def, 40, 11)).toEqual({
      stage: "onset",
      changed: true,
      reason: "threshold",
    });
  });

  it("holds when severity is below the next threshold", () => {
    expect(nextStage(at("signal", 10), def, 25, 12).changed).toBe(false);
  });

  it("lets a signal fizzle out when contained or expired", () => {
    expect(nextStage(at("signal", 10), def, 10, 11)).toMatchObject({
      stage: "resolved",
      reason: "contained",
    });
    expect(nextStage(at("signal", 10), def, 25, 14)).toMatchObject({
      stage: "resolved",
      reason: "expired",
    });
  });

  it("moves onset to peak at the peak threshold after its minimum", () => {
    expect(nextStage(at("onset", 10), def, 65, 11).changed).toBe(false);
    expect(nextStage(at("onset", 10), def, 65, 12)).toMatchObject({ stage: "peak" });
  });

  it("surges past the stage minimum when severity is extreme", () => {
    expect(nextStage(at("onset", 10), def, 90, 10)).toEqual({
      stage: "peak",
      changed: true,
      reason: "surge",
    });
    expect(nextStage(at("signal", 10), def, 90, 10)).toMatchObject({ stage: "onset" });
  });

  it("never skips a stage in one call", () => {
    expect(nextStage(at("signal", 10), def, 100, 10).stage).toBe("onset");
  });

  it("sends a contained onset straight to aftermath", () => {
    expect(nextStage(at("onset", 10), def, 10, 12)).toMatchObject({
      stage: "aftermath",
      reason: "contained",
    });
  });

  it("sends an onset that never peaks to aftermath when it expires", () => {
    expect(nextStage(at("onset", 10), def, 40, 16)).toMatchObject({
      stage: "aftermath",
      reason: "expired",
    });
  });

  it("eases peak into aftermath once severity falls to the easing threshold", () => {
    expect(nextStage(at("peak", 10), def, 50, 13).changed).toBe(false);
    expect(nextStage(at("peak", 10), def, 45, 13)).toMatchObject({ stage: "aftermath" });
    expect(nextStage(at("peak", 10), def, 45, 11).changed).toBe(false);
  });

  it("ends a peak that will not ease at its max turns", () => {
    expect(nextStage(at("peak", 10), def, 80, 20)).toMatchObject({
      stage: "aftermath",
      reason: "expired",
    });
  });

  it("resolves aftermath when contained or expired", () => {
    expect(nextStage(at("aftermath", 10), def, 15, 12)).toMatchObject({ stage: "resolved" });
    expect(nextStage(at("aftermath", 10), def, 30, 12).changed).toBe(false);
    expect(nextStage(at("aftermath", 10), def, 30, 18)).toMatchObject({
      stage: "resolved",
      reason: "expired",
    });
  });

  it("relapses to peak while relapses remain, then stops", () => {
    expect(nextStage(at("aftermath", 10), def, 70, 11)).toEqual({
      stage: "peak",
      changed: true,
      reason: "relapse",
    });
    expect(nextStage(at("aftermath", 10, { relapses: 1 }), def, 70, 11).stage).toBe("aftermath");
    const noRelapse = makeDefinition({ maxRelapses: undefined });
    expect(nextStage(at("aftermath", 10), noRelapse, 70, 11).changed).toBe(false);
  });

  it("treats resolved as terminal", () => {
    expect(nextStage(at("resolved", 10), def, 100, 99).changed).toBe(false);
  });

  it("waits indefinitely when a stage has no max turns", () => {
    const open = makeDefinition({
      stages: { ...def.stages, peak: { minTurns: 1, maxTurns: null } },
    });
    expect(nextStage(at("peak", 0), open, 80, 500).changed).toBe(false);
  });
});

describe("applyTransition", () => {
  it("restarts the stage clock and counts relapses", () => {
    const relapsed = applyTransition(
      at("aftermath", 10),
      { stage: "peak", changed: true, reason: "relapse" },
      14
    );
    expect(relapsed).toMatchObject({ stage: "peak", stageStartTurn: 14, relapses: 1 });
    expect(turnsInStage(relapsed, 17)).toBe(3);
  });

  it("returns the same instance when nothing changed", () => {
    const inst = at("peak", 10);
    expect(applyTransition(inst, { stage: "peak", changed: false, reason: "hold" }, 12)).toBe(inst);
  });
});
