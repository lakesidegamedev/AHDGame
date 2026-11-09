import { describe, expect, it } from "vitest";
import { canIssueWhip } from "./playerWhip";

describe("whip audience eligibility", () => {
  it("rejects all hard player whips and preserves advisory player whips", () => {
    expect(canIssueWhip({ audience: "character", mode: "hard" })).toBe(false);
    expect(canIssueWhip({ audience: "character", mode: "soft" })).toBe(true);
  });
  it.each(["soft", "hard"] as const)("retains %s NPP whips", (mode) => {
    expect(canIssueWhip({ audience: "npp", mode })).toBe(true);
  });
});
