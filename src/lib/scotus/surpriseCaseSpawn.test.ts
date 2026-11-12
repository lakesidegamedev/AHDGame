import { describe, expect, it } from "vitest";
import {
  SURPRISE_CASE_HEARING_DELAY_TURNS,
  SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN,
  rollSurpriseCaseSpawn,
  surpriseCaseHearingDelayTurns,
} from "./surpriseCaseSpawn";

describe("rollSurpriseCaseSpawn", () => {
  it("spawns when the draw is below the probability", () => {
    expect(rollSurpriseCaseSpawn(SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN - 0.0001)).toBe(true);
    expect(rollSurpriseCaseSpawn(0)).toBe(true);
  });

  it("does not spawn when the draw is at or above the probability", () => {
    expect(rollSurpriseCaseSpawn(SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN)).toBe(false);
    expect(rollSurpriseCaseSpawn(SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN + 0.0001)).toBe(false);
    expect(rollSurpriseCaseSpawn(0.5)).toBe(false);
    expect(rollSurpriseCaseSpawn(0.999)).toBe(false);
  });

  it("remains a low per-turn probability", () => {
    expect(SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN).toBeGreaterThan(0);
    expect(SURPRISE_CASE_SPAWN_PROBABILITY_PER_TURN).toBeLessThan(0.01);
  });

  it("accepts an explicit probability override", () => {
    expect(rollSurpriseCaseSpawn(0.3, 0.5)).toBe(true);
    expect(rollSurpriseCaseSpawn(0.6, 0.5)).toBe(false);
  });

  it("is deterministic for the same inputs", () => {
    const results = Array.from({ length: 10 }, () => rollSurpriseCaseSpawn(0.001));
    expect(new Set(results).size).toBe(1);
  });

  it("draws the hearing delay across the table and never outside it", () => {
    const { min, max } = SURPRISE_CASE_HEARING_DELAY_TURNS;
    expect(surpriseCaseHearingDelayTurns(0)).toBe(min);
    expect(surpriseCaseHearingDelayTurns(0.9999999)).toBe(max);
    expect(surpriseCaseHearingDelayTurns(1)).toBe(max);
    expect(min).toBeGreaterThan(0);
  });
});
