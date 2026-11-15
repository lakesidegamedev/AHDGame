import { describe, expect, it } from "vitest";
import { hardNavigationTarget, isLightShellPath, shouldUseLightShell } from "./lightShell";

const anonymous = {
  pathname: "/",
  hasSessionCookie: false,
  singleplayer: false,
  isWikiSubdomain: false,
  isNativeApp: false,
  isClientShell: false,
  isStoreApp: false,
};

describe("shouldUseLightShell", () => {
  it("is on for an anonymous browser on / and /login", () => {
    expect(shouldUseLightShell(anonymous)).toBe(true);
    expect(shouldUseLightShell({ ...anonymous, pathname: "/login" })).toBe(true);
    expect(shouldUseLightShell({ ...anonymous, pathname: "/login/" })).toBe(true);
  });

  it("is off for anyone with a session cookie", () => {
    expect(shouldUseLightShell({ ...anonymous, hasSessionCookie: true })).toBe(false);
  });

  it("is off for every other path, and for a missing path", () => {
    for (const pathname of ["/about", "/register", "/world", "/profile", "/login/x", ""]) {
      expect(shouldUseLightShell({ ...anonymous, pathname })).toBe(false);
    }
  });

  it("is off in singleplayer, the wiki subdomain and the app shells", () => {
    for (const flag of [
      "singleplayer",
      "isWikiSubdomain",
      "isNativeApp",
      "isClientShell",
      "isStoreApp",
    ] as const) {
      expect(shouldUseLightShell({ ...anonymous, [flag]: true })).toBe(false);
    }
  });
});

describe("isLightShellPath", () => {
  it("matches exactly the light paths", () => {
    expect(isLightShellPath("/")).toBe(true);
    expect(isLightShellPath("/login")).toBe(true);
    expect(isLightShellPath("/loginx")).toBe(false);
    expect(isLightShellPath(null)).toBe(false);
  });
});

describe("hardNavigationTarget", () => {
  const current = { origin: "https://example.test", href: "https://example.test/" };

  it("sends links that leave the light set to a full page load", () => {
    expect(hardNavigationTarget("/register", current)).toBe("https://example.test/register");
    expect(hardNavigationTarget("/world?x=1", current)).toBe("https://example.test/world?x=1");
  });

  it("leaves light-to-light, external and same-page links to the router", () => {
    expect(hardNavigationTarget("/login", current)).toBeNull();
    expect(hardNavigationTarget("/", current)).toBeNull();
    expect(hardNavigationTarget("https://discord.gg/x", current)).toBeNull();
    expect(hardNavigationTarget("https://example.test/", current)).toBeNull();
  });
});
