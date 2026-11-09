import { describe, it, expect, vi, afterEach } from "vitest";
import { bulkMarkRead } from "./bulkMarkRead";
import { BULK_READ_MAX_IDS } from "@/lib/inbox/bulkRead";

function response(status: number, retryAfter?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(retryAfter ? { "Retry-After": retryAfter } : {}),
  } as unknown as Response;
}

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockResolvedValueOnce(r));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

describe("bulkMarkRead", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends nothing for an empty list", async () => {
    const fetchMock = stubFetch();
    const result = await bulkMarkRead("/api/mail", []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failedIds.size).toBe(0);
  });

  it("splits a long list into chunks the server accepts", async () => {
    const fetchMock = stubFetch(response(200), response(200));
    const result = await bulkMarkRead("/api/notifications", ids(BULK_READ_MAX_IDS + 5));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sizes = fetchMock.mock.calls.map(
      (c) => (JSON.parse(String((c[1] as RequestInit).body)) as { ids: string[] }).ids.length
    );
    expect(sizes).toEqual([BULK_READ_MAX_IDS, 5]);
    expect(result.failedIds.size).toBe(0);
    expect(result.rateLimited).toBe(false);
  });

  it("retries once after a short Retry-After and then succeeds", async () => {
    const fetchMock = stubFetch(response(429, "2"), response(200));
    const sleep = vi.fn(async () => {});
    const result = await bulkMarkRead("/api/mail", ids(3), sleep);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(result.failedIds.size).toBe(0);
    expect(result.rateLimited).toBe(false);
  });

  it("reports rate limiting when the retry is refused too", async () => {
    const fetchMock = stubFetch(response(429, "2"), response(429, "2"));
    const result = await bulkMarkRead("/api/mail", ids(3), async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.rateLimited).toBe(true);
    expect([...result.failedIds]).toEqual(ids(3));
  });

  it("does not wait out a long Retry-After and stops sending further chunks", async () => {
    const fetchMock = stubFetch(response(429, "50"));
    const sleep = vi.fn(async () => {});
    const result = await bulkMarkRead("/api/notifications", ids(BULK_READ_MAX_IDS + 5), sleep);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.rateLimited).toBe(true);
    expect(result.failedIds.size).toBe(BULK_READ_MAX_IDS + 5);
  });

  it("treats a server error or network failure as a plain failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(500))
      .mockRejectedValueOnce(new Error("offline"));
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await bulkMarkRead("/api/notifications", ids(BULK_READ_MAX_IDS + 1));
    expect(result.rateLimited).toBe(false);
    expect(result.failedIds.size).toBe(BULK_READ_MAX_IDS + 1);
  });
});
