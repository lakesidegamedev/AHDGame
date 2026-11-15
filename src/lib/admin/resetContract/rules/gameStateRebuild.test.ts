import { describe, expect, it } from "vitest";
import { planGameStateRebuild } from "./gameStateRebuild";

describe("planGameStateRebuild", () => {
  it("removes every outgoing field that is neither written nor kept, including undeclared ones", () => {
    const plan = planGameStateRebuild(
      ["_id", "currentTurn", "iterationHistory", "legacyWarScore", "lastCensusYear"],
      ["currentTurn"],
      ["iterationHistory"],
      []
    );
    expect(plan.unset).toEqual(["lastCensusYear", "legacyWarScore"]);
    expect(plan.kept).toEqual(["iterationHistory"]);
  });

  it("removes a forced field even when a keep reason names it", () => {
    const plan = planGameStateRebuild(
      ["eurozoneEnabled"],
      [],
      ["eurozoneEnabled"],
      ["eurozoneEnabled"]
    );
    expect(plan.unset).toEqual(["eurozoneEnabled"]);
    expect(plan.kept).toEqual([]);
  });

  it("unsets forced fields that the outgoing document does not carry", () => {
    expect(planGameStateRebuild([], [], [], ["lastAutoSeedTurn"]).unset).toEqual([
      "lastAutoSeedTurn",
    ]);
  });

  it("never unsets the id or a field the reset writes", () => {
    const plan = planGameStateRebuild(
      ["_id", "preIteration"],
      ["preIteration"],
      [],
      ["preIteration"]
    );
    expect(plan.unset).toEqual([]);
  });
});
