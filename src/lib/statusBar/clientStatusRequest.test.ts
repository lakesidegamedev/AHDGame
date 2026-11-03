import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The navbar and the status bar both need `/api/client-status` and mount in the
 * same commit. These tests pin the sharing behaviour that stops them issuing two
 * requests (and ~46 Mongo commands) per page view.
 *
 * The module keeps module-level state, so each test imports a fresh copy.
 */
async function importModule() {
  vi.resetModules();
  return import("./clientStatusRequest");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchClientStatusJson", () => {
  it("shares one request between concurrent callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok", funds: 10 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchClientStatusJson } = await importModule();

    const [a, b] = await Promise.all([
      fetchClientStatusJson("/api/client-status?layout=standard"),
      fetchClientStatusJson("/api/client-status?layout=standard"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    expect(a.data).toMatchObject({ status: "ok", funds: 10 });
  });

  it("reuses a very recent result instead of refetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchClientStatusJson } = await importModule();

    await fetchClientStatusJson("/api/client-status?layout=standard");
    await fetchClientStatusJson("/api/client-status?layout=standard");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches again for a different layout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchClientStatusJson } = await importModule();

    await fetchClientStatusJson("/api/client-status?layout=standard");
    await fetchClientStatusJson("/api/client-status?layout=corp");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a non-2xx response without caching it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, 503))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchClientStatusJson } = await importModule();

    const first = await fetchClientStatusJson("/api/client-status?layout=standard");
    expect(first.ok).toBe(false);
    expect(first.status).toBe(503);
    expect(first.data).toBeNull();

    const second = await fetchClientStatusJson("/api/client-status?layout=standard");
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a network failure as status 0 rather than throwing", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const { fetchClientStatusJson } = await importModule();

    const result = await fetchClientStatusJson("/api/client-status?layout=standard");
    expect(result).toEqual({ ok: false, status: 0, data: null });
  });

  it("passes caller options through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchClientStatusJson } = await importModule();

    await fetchClientStatusJson("/api/client-status?layout=standard", { cache: "no-cache" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-status?layout=standard",
      expect.objectContaining({ cache: "no-cache", credentials: "same-origin" })
    );
  });
});
