import { describe, expect, it } from "vitest";
import { countDisplayedPartyPlayers } from "./displayedPlayers";

const now = new Date("2027-06-01T00:00:00Z");
const recent = new Date("2027-05-31T00:00:00Z");
const longAgo = new Date("2026-01-01T00:00:00Z");
const chars = ["a", "b", "c", "d"].map((u) => ({ party: "1", userId: u }));

describe("countDisplayedPartyPlayers", () => {
  it("drops banned and long-inactive users so the roster list matches the party HQ", () => {
    const users = new Map([
      ["a", { lastActivity: recent, createdAt: longAgo }],
      ["b", { isBanned: true, lastActivity: recent, createdAt: longAgo }],
      ["c", { lastActivity: longAgo, createdAt: longAgo }],
    ]);
    expect(countDisplayedPartyPlayers(chars, users, now).get("1")).toBe(1);
  });
});
