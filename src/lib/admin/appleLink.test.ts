import { describe, expect, it } from "vitest";
import { isAppleLinked, isNoDiscordAppleLinked } from "./appleLink";

describe("isAppleLinked", () => {
  it("is true only for a non-empty string", () => {
    expect(isAppleLinked({ appleId: "apple-sub-1" })).toBe(true);
    expect(isAppleLinked({ appleId: "" })).toBe(false);
    expect(isAppleLinked({ appleId: null })).toBe(false);
    expect(isAppleLinked({})).toBe(false);
  });
});

describe("isNoDiscordAppleLinked", () => {
  it("matches Apple-linked accounts without Discord", () => {
    expect(isNoDiscordAppleLinked({ appleLinked: true, discordId: null })).toBe(true);
  });
  it("excludes accounts with Discord or without Apple", () => {
    expect(isNoDiscordAppleLinked({ appleLinked: true, discordId: "123" })).toBe(false);
    expect(isNoDiscordAppleLinked({ appleLinked: true, discordUsername: "x" })).toBe(false);
    expect(isNoDiscordAppleLinked({ appleLinked: false, discordId: null })).toBe(false);
    expect(isNoDiscordAppleLinked({})).toBe(false);
  });
});
