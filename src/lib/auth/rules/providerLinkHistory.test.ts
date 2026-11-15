import { describe, expect, it } from "vitest";
import {
  appleExemptionHolds,
  groupSubjectHashes,
  sharedProviderSubject,
} from "./providerLinkHistory";

describe("appleExemptionHolds", () => {
  it("holds when no other account ever held the Apple subject", () => {
    expect(
      appleExemptionHolds("u1", "h1", [{ userId: "u1", subjectHash: "h1", action: "link", at: 1 }])
    ).toBe(true);
  });

  it("fails when a different account linked then unlinked it", () => {
    const history = [
      { userId: "u0", subjectHash: "h1", action: "link" as const, at: 1 },
      { userId: "u0", subjectHash: "h1", action: "unlink" as const, at: 2 },
    ];
    expect(appleExemptionHolds("u1", "h1", history)).toBe(false);
  });

  it("fails without a subject hash", () => {
    expect(appleExemptionHolds("u1", null, [])).toBe(false);
  });
});

describe("sharedProviderSubject", () => {
  it("finds a shared hash within one provider", () => {
    expect(sharedProviderSubject({ discord: ["x"] }, { discord: ["y", "x"] })).toBe("discord");
  });
  it("returns null with nothing shared", () => {
    expect(sharedProviderSubject({ apple: ["x"] }, { apple: ["y"] })).toBeNull();
    expect(sharedProviderSubject(undefined, { apple: ["y"] })).toBeNull();
  });
});

describe("groupSubjectHashes", () => {
  it("groups by provider", () => {
    const grouped = groupSubjectHashes([
      { provider: "apple", subjectHash: "a" },
      { provider: "apple", subjectHash: "b" },
    ]);
    expect([...(grouped.get("apple") ?? [])]).toEqual(["a", "b"]);
  });
});
