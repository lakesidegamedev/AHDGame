import { describe, expect, it } from "vitest";
import { shouldServeStaticLanding, type StaticLandingInput } from "./staticLandingEligibility";

const anonymous: StaticLandingInput = {
  pathname: "/",
  method: "GET",
  hasSessionCookie: false,
  singleplayer: false,
  isWikiSubdomain: false,
  isNativeApp: false,
  isClientShell: false,
  isStoreApp: false,
};

describe("shouldServeStaticLanding", () => {
  it("serves an anonymous browser visit to the home page", () => {
    expect(shouldServeStaticLanding(anonymous)).toBe(true);
    expect(shouldServeStaticLanding({ ...anonymous, method: "HEAD" })).toBe(true);
  });

  it.each([
    ["a session cookie", { hasSessionCookie: true }],
    ["singleplayer", { singleplayer: true }],
    ["the wiki host", { isWikiSubdomain: true }],
    ["a native app webview", { isNativeApp: true }],
    ["a client shell", { isClientShell: true }],
    ["a store app", { isStoreApp: true }],
    ["another path", { pathname: "/login" }],
    ["a nested path", { pathname: "/guides" }],
    ["a write", { method: "POST" }],
  ])("does not serve it for %s", (_name, override) => {
    expect(shouldServeStaticLanding({ ...anonymous, ...override })).toBe(false);
  });
});
