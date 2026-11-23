import { describe, it, expect } from "vitest";
import { alignRoundNumbers } from "./roundNumbers";

const day = Date.UTC(2026, 10, 15, 3);

describe("alignRoundNumbers", () => {
  it("lifts laggards to the opening day's number and skips excluded kinds", () => {
    const rows = [
      { id: "kingmaker:6", kind: "kingmaker", roundNumber: 6, startedAtMs: day },
      { id: "influence_gain:7", kind: "influence_gain", roundNumber: 7, startedAtMs: day + 1000 },
      {
        id: "referrals_iteration:2",
        kind: "referrals_iteration",
        roundNumber: 2,
        startedAtMs: day,
      },
      { id: "kingmaker:7", kind: "kingmaker", roundNumber: 7, startedAtMs: day + 7 * 86400000 },
    ];
    expect(alignRoundNumbers(rows, ["referrals_iteration"])).toEqual([
      { id: "kingmaker:6", from: 6, to: 7 },
    ]);
  });
});
