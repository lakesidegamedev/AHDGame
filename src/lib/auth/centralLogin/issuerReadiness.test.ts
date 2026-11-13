import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "central", breakerOpen: false }));
vi.mock("./index", () => ({ getCentralLoginMode: () => state.mode }));
vi.mock("./bridgeClient", () => ({ bridgeBreakerOpen: () => state.breakerOpen }));
vi.mock("@/lib/config/auth", () => ({
  authConfig: { unifiedOidcIssuer: () => "https://issuer.example.invalid/realm/" },
}));

import { isHopIssuerReady, resetIssuerReadinessCache } from "./issuerReadiness";
import { chooseHopNavigation } from "./hopRules";

const fetchMock = vi.fn();

beforeEach(() => {
  state.mode = "central";
  state.breakerOpen = false;
  fetchMock.mockReset();
  resetIssuerReadinessCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isHopIssuerReady", () => {
  it("is ready when discovery answers", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await isHopIssuerReady()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://issuer.example.invalid/realm/.well-known/openid-configuration"
    );
  });

  it("is not ready on an error status", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await isHopIssuerReady()).toBe(false);
  });

  it("is not ready when the probe times out or fails", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    expect(await isHopIssuerReady()).toBe(false);
  });

  it("caches for ten seconds, then probes again", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await isHopIssuerReady();
    await isHopIssuerReady();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_001);
    await isHopIssuerReady();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is not ready while the bridge breaker is open, without a probe", async () => {
    state.breakerOpen = true;
    expect(await isHopIssuerReady()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["off", "shadow"])("%s: no network call", async (mode) => {
    state.mode = mode;
    expect(await isHopIssuerReady()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("chooseHopNavigation", () => {
  it("follows the hop only when ready is true", () => {
    expect(chooseHopNavigation("https://i/auth", { ready: true }, "/home")).toBe("https://i/auth");
    expect(chooseHopNavigation("https://i/auth", { ready: false }, "/home")).toBe("/home");
    expect(chooseHopNavigation("https://i/auth", null, "/home")).toBe("/home");
    expect(chooseHopNavigation("https://i/auth", {}, "/home")).toBe("/home");
  });
});
