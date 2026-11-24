/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.fn();
vi.mock("@/lib/observability/sentryClientLazy", () => ({
  captureClientException: (...args: unknown[]) => capture(...args),
}));

import { fetchMapJson, MapLoadError, resetMapLoadReports } from "./mapLoad";

beforeEach(() => {
  capture.mockClear();
  resetMapLoadReports();
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchMapJson", () => {
  it("returns parsed json on success without reporting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"a":1}')));
    await expect(fetchMapJson("/m.json")).resolves.toEqual({ a: 1 });
    expect(capture).not.toHaveBeenCalled();
  });

  it("reports url, status and origin on an http failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 404 })));
    await expect(fetchMapJson("/m.json", undefined, "world-topology")).rejects.toBeInstanceOf(
      MapLoadError
    );
    expect(capture).toHaveBeenCalledTimes(1);
    const ctx = capture.mock.calls[0][1];
    expect(ctx.extra.url).toBe("/m.json");
    expect(ctx.extra.status).toBe(404);
    expect(ctx.extra.origin).toBe(window.location.origin);
    expect(ctx.tags.phase).toBe("world-topology");
  });

  it("reports network level failures, such as a blocked cross-origin request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchMapJson("https://cdn.example/m.json")).rejects.toBeInstanceOf(MapLoadError);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1].extra.status).toBeNull();
  });

  it("reports a given url and phase once per session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await fetchMapJson("/m.json").catch(() => {});
    await fetchMapJson("/m.json").catch(() => {});
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
