import { describe, it, expect } from "vitest";
import {
  buildStatusPatch,
  buildStatusStats,
  statusIsForOtherCharacter,
} from "./CharacterStatsContext";

describe("buildStatusPatch", () => {
  it("maps present fields, including actions and campaign funds", () => {
    const patch = buildStatusPatch({
      actions: 7,
      funds: 2_100_000,
      campaignFundsStored: 2_100_000,
      cashOnHand: 5,
      personalHomeLiquid: 5,
    });
    expect(patch.actions).toBe(7);
    expect(patch.campaignFundsStored).toBe(2_100_000);
    expect(patch.personalHomeLiquid).toBe(5);
  });

  it("omits absent fields so a patch never clobbers existing state with undefined", () => {
    const patch = buildStatusPatch({ actions: 3 });
    expect(patch.actions).toBe(3);
    expect("campaignFundsStored" in patch).toBe(false);
    expect("corp" in patch).toBe(false);
    expect("electionStats" in patch).toBe(false);
  });

  it("normalizes corpNav/electionStats nulls into corp/electionStats null", () => {
    const patch = buildStatusPatch({ corpNav: null, electionStats: null });
    expect(patch.corp).toBeNull();
    expect(patch.electionStats).toBeNull();
  });
});

describe("active character identity", () => {
  it("carries the character id into the whole stats object", () => {
    expect(buildStatusStats({ characterId: "c1", name: "Clara", actions: 4 }).characterId).toBe(
      "c1"
    );
  });

  it("flags a status response for a different character than the held stats", () => {
    expect(statusIsForOtherCharacter({ characterId: "egg" }, { characterId: "clara" })).toBe(true);
  });

  it("does not flag the same character, missing ids, or empty held stats", () => {
    expect(statusIsForOtherCharacter({ characterId: "egg" }, { characterId: "egg" })).toBe(false);
    expect(statusIsForOtherCharacter({ characterId: "egg" }, {})).toBe(false);
    expect(statusIsForOtherCharacter({}, { characterId: "clara" })).toBe(false);
    expect(statusIsForOtherCharacter(null, { characterId: "clara" })).toBe(false);
  });
});
