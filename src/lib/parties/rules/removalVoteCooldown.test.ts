import { describe, expect, it } from "vitest";
import {
  REMOVAL_VOTE_COOLDOWN_TURNS,
  removalCooldownMessage,
  removalVoteCooldown,
} from "./removalVoteCooldown";

describe("removalVoteCooldown", () => {
  it("is 24 turns", () => {
    expect(REMOVAL_VOTE_COOLDOWN_TURNS).toBe(24);
  });

  it("locks for 24 turns after the holder took the seat", () => {
    expect(
      removalVoteCooldown({ currentTurn: 193, seatedTurn: 170, lastFailedRemovalTurn: null })
    ).toEqual({ locked: true, reason: "recently_seated", sinceTurn: 170, unlocksAtTurn: 194 });
  });

  it("unlocks exactly 24 turns after the seat was taken", () => {
    expect(
      removalVoteCooldown({ currentTurn: 194, seatedTurn: 170, lastFailedRemovalTurn: null }).locked
    ).toBe(false);
  });

  it("locks for 24 turns after a failed or expired removal vote", () => {
    expect(
      removalVoteCooldown({ currentTurn: 200, seatedTurn: 100, lastFailedRemovalTurn: 190 })
    ).toEqual({
      locked: true,
      reason: "recent_failed_removal",
      sinceTurn: 190,
      unlocksAtTurn: 214,
    });
  });

  it("reports whichever lock lasts longer when both apply", () => {
    const lock = removalVoteCooldown({
      currentTurn: 181,
      seatedTurn: 180,
      lastFailedRemovalTurn: 175,
    });
    expect(lock.reason).toBe("recently_seated");
    expect(lock.unlocksAtTurn).toBe(204);
  });

  it("is open when nothing recent is known", () => {
    expect(
      removalVoteCooldown({ currentTurn: 300, seatedTurn: null, lastFailedRemovalTurn: null })
    ).toEqual({ locked: false, reason: null, sinceTurn: null, unlocksAtTurn: null });
    expect(
      removalVoteCooldown({ currentTurn: 300, seatedTurn: 122, lastFailedRemovalTurn: 171 }).locked
    ).toBe(false);
  });
});

describe("removalCooldownMessage", () => {
  it("explains a seat lock with the unlock turn", () => {
    const lock = removalVoteCooldown({
      currentTurn: 180,
      seatedTurn: 170,
      lastFailedRemovalTurn: null,
    });
    const text = removalCooldownMessage(lock, "National Chair");
    expect(text).toBe(
      "They took the National Chair seat at turn 170. A new removal vote can be opened from turn 194 (24 turns later)."
    );
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("explains a failed-vote lock", () => {
    const lock = removalVoteCooldown({
      currentTurn: 200,
      seatedTurn: null,
      lastFailedRemovalTurn: 196,
    });
    expect(removalCooldownMessage(lock, "National Treasurer")).toContain(
      "A vote to remove them failed or expired at turn 196."
    );
  });

  it("is empty when not locked", () => {
    const lock = removalVoteCooldown({
      currentTurn: 300,
      seatedTurn: 1,
      lastFailedRemovalTurn: null,
    });
    expect(removalCooldownMessage(lock, "National Chair")).toBe("");
  });
});
