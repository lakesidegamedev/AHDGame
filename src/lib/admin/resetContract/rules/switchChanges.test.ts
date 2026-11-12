import { describe, expect, it } from "vitest";
import { diffSwitches, formatSwitchChange } from "./switchChanges";

describe("diffSwitches", () => {
  it("lists only switches whose value changed, sorted by name", () => {
    const changes = diffSwitches(
      "gameState",
      ["playerTransfersPaused", "corporationActionsPaused", "wikiDisabled"],
      { corporationActionsPaused: true, playerTransfersPaused: true, wikiDisabled: false },
      { corporationActionsPaused: false, playerTransfersPaused: true, wikiDisabled: false }
    );
    expect(changes).toEqual([
      { source: "gameState", name: "corporationActionsPaused", before: true, after: false },
    ]);
  });

  it("treats a missing value as unset on both sides", () => {
    expect(diffSwitches("gameConfig", ["firstJoinerBecomesPartyChair"], {}, null)).toEqual([]);
    expect(
      diffSwitches(
        "gameConfig",
        ["firstJoinerBecomesPartyChair"],
        { firstJoinerBecomesPartyChair: false },
        {}
      )
    ).toEqual([
      { source: "gameConfig", name: "firstJoinerBecomesPartyChair", before: false, after: null },
    ]);
  });

  it("ignores fields that are not tracked", () => {
    expect(diffSwitches("gameState", ["a"], { a: 1, b: 1 }, { a: 1, b: 2 })).toEqual([]);
  });

  it("formats a change for the log", () => {
    expect(
      formatSwitchChange({ source: "gameConfig", name: "x", before: false, after: true })
    ).toBe("gameConfig.x: false -> true");
  });
});
