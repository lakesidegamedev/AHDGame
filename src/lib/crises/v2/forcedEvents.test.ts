import { describe, expect, it } from "vitest";
import { stepForcedEvents } from "./forcedEvents";
import { makeDefinition } from "./testFixtures";
import type { CrisisInstance } from "./types";

const def = makeDefinition({
  forcedEvents: [
    { id: "strike", event: "strike", minSeverity: 70, sustainedTurns: 3, stages: ["peak"] },
    { id: "soe", event: "stateOfEmergency", minSeverity: 90, sustainedTurns: 1 },
  ],
});

const at = (
  severity: number,
  forced?: CrisisInstance["forced"],
  stage: CrisisInstance["stage"] = "peak"
) => ({ stage, severity, forced });

describe("stepForcedEvents", () => {
  it("fires only after the severity has been held for the sustained run", () => {
    let progress = stepForcedEvents(def, at(75)).progress;
    expect(progress.streaks.strike).toBe(1);
    progress = stepForcedEvents(def, at(75, progress)).progress;
    expect(progress.streaks.strike).toBe(2);
    const step = stepForcedEvents(def, at(75, progress));
    expect(step.fired.map((f) => f.id)).toEqual(["strike"]);
    expect(step.progress.fired).toEqual(["strike"]);
  });

  it("loses the run when severity dips or the stage is wrong", () => {
    const held = stepForcedEvents(def, at(75)).progress;
    expect(stepForcedEvents(def, at(60, held)).progress.streaks).toEqual({});
    expect(stepForcedEvents(def, at(75, held, "onset")).progress.streaks).toEqual({});
  });

  it("fires each event once per crisis", () => {
    const first = stepForcedEvents(def, at(95));
    expect(first.fired.map((f) => f.id)).toEqual(["soe"]);
    const again = stepForcedEvents(def, at(95, first.progress));
    expect(again.fired.map((f) => f.id)).toEqual([]);
    expect(again.progress.fired).toEqual(["soe"]);
  });

  it("fires an event with no stage restriction in any active stage but not once resolved", () => {
    expect(stepForcedEvents(def, at(95, undefined, "onset")).fired).toHaveLength(1);
    expect(stepForcedEvents(def, at(95, undefined, "resolved")).fired).toHaveLength(0);
  });
});
