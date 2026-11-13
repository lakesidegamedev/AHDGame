import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  entitlementExpiryMs,
  FREE_ACCESS_GRANT_MS,
  isFreeAccessOn,
  parseFreeAccessBody,
  resetFreeAccessCache,
} from "./freeAccess";

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  resetFreeAccessCache();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isFreeAccessOn", () => {
  it("is off when the switch is off", async () => {
    vi.stubGlobal("fetch", respond({ on: false, changedAt: null }));
    expect(await isFreeAccessOn()).toBe(false);
  });

  it("is on when the switch is on", async () => {
    const fetchMock = respond({ on: true, changedAt: "2026-11-12T00:00:00Z" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await isFreeAccessOn()).toBe(true);
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toBe(
      "https://lakesidegames.net/account/api/free-access"
    );
  });

  it("fails closed on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      })
    );
    expect(await isFreeAccessOn()).toBe(false);
  });

  it("fails closed on a non-200 answer and a malformed body", async () => {
    vi.stubGlobal("fetch", respond({ on: true }, 500));
    expect(await isFreeAccessOn()).toBe(false);
    resetFreeAccessCache();
    vi.stubGlobal("fetch", respond({ on: "true" }));
    expect(await isFreeAccessOn()).toBe(false);
    resetFreeAccessCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json"))
    );
    expect(await isFreeAccessOn()).toBe(false);
  });

  it("caches for 60 seconds, then asks again", async () => {
    const fetchMock = respond({ on: true });
    vi.stubGlobal("fetch", fetchMock);
    await isFreeAccessOn();
    await isFreeAccessOn();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await isFreeAccessOn();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("parseFreeAccessBody", () => {
  it("accepts only a literal true", () => {
    expect(parseFreeAccessBody({ on: true })).toBe(true);
    expect(parseFreeAccessBody({ on: 1 })).toBe(false);
    expect(parseFreeAccessBody(null)).toBe(false);
    expect(parseFreeAccessBody("on")).toBe(false);
  });
});

describe("entitlementExpiryMs", () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  it("caps a free-access-only grant at one hour", () => {
    expect(entitlementExpiryMs({ nowMs: 1000, graceMs: week, freeAccessOnly: true })).toBe(
      1000 + FREE_ACCESS_GRANT_MS
    );
  });
  it("keeps the long grace for a real entitlement", () => {
    expect(entitlementExpiryMs({ nowMs: 1000, graceMs: week, freeAccessOnly: false })).toBe(
      1000 + week
    );
  });
});
