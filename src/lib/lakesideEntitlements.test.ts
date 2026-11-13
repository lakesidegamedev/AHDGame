import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLakesideEntitlement, resetLakesideEntitlementCache } from "./lakesideEntitlements";
import { tierIncludesSingleplayer } from "@/lib/db/types";

const body = (purchases: unknown[], status = 200) =>
  vi.fn(
    async (..._args: [string, RequestInit?]) =>
      new Response(JSON.stringify({ purchases }), { status })
  );

beforeEach(() => {
  resetLakesideEntitlementCache();
  vi.useFakeTimers();
  vi.stubEnv("LAKESIDE_ACCOUNTS_INTERNAL_TOKEN", "test-token");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hasLakesideEntitlement", () => {
  it("is on for a paid item of any provider, sending the bearer token", async () => {
    const fetchMock = body([{ productId: "ahd-singleplayer", provider: "grant", status: "paid" }]);
    vi.stubGlobal("fetch", fetchMock);
    expect(await hasLakesideEntitlement("u1", "ahd-singleplayer")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/account/api/entitlements?ahdUserId=u1");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("is off for another product or an unpaid status", async () => {
    vi.stubGlobal(
      "fetch",
      body([
        { productId: "sandbox", provider: "stripe", status: "refunded" },
        { productId: "other", provider: "stripe", status: "paid" },
      ])
    );
    expect(await hasLakesideEntitlement("u1", "sandbox")).toBe(false);
  });

  it("makes no network call when the token is unset", async () => {
    vi.stubEnv("LAKESIDE_ACCOUNTS_INTERNAL_TOKEN", "");
    const fetchMock = body([]);
    vi.stubGlobal("fetch", fetchMock);
    expect(await hasLakesideEntitlement("u1", "sandbox")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on errors and non-200 answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down")))
    );
    expect(await hasLakesideEntitlement("u1", "sandbox")).toBe(false);
    resetLakesideEntitlementCache();
    vi.stubGlobal("fetch", body([{ productId: "sandbox", status: "paid" }], 503));
    expect(await hasLakesideEntitlement("u1", "sandbox")).toBe(false);
  });

  it("caches per user for 60 seconds", async () => {
    const fetchMock = body([{ productId: "sandbox", provider: "grant", status: "paid" }]);
    vi.stubGlobal("fetch", fetchMock);
    await hasLakesideEntitlement("u1", "sandbox");
    await hasLakesideEntitlement("u1", "ahd-singleplayer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await hasLakesideEntitlement("u2", "sandbox");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(61_000);
    await hasLakesideEntitlement("u1", "sandbox");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("tierIncludesSingleplayer", () => {
  it("excludes plain supporter, includes the plus tiers, respects expiry", () => {
    expect(tierIncludesSingleplayer("supporter")).toBe(false);
    expect(tierIncludesSingleplayer("supporter-plus")).toBe(true);
    expect(tierIncludesSingleplayer("supporter-plus-plus")).toBe(true);
    expect(tierIncludesSingleplayer(null)).toBe(false);
    expect(tierIncludesSingleplayer("supporter-plus", new Date(Date.now() - 1000))).toBe(false);
  });
});
