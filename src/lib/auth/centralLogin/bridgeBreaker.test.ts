import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("./shadowEvents", () => ({
  recordShadowEvent: async (event: Record<string, unknown>) => {
    events.push(event);
  },
}));

import {
  bridgeAccountDelete,
  bridgeAccountUpsert,
  bridgeLoginTicket,
  bridgePasswordCheck,
  bridgePasswordSet,
  resetBridgeTokenCache,
} from "./bridgeClient";

const fetchMock = vi.fn();
let bridgeUp = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  events.length = 0;
  bridgeUp = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "https://token.example.invalid/token") {
      return json({ access_token: "synthetic-token", expires_in: 300 });
    }
    return bridgeUp ? json({ result: "ok", ticket: "t1" }) : json({}, 500);
  });
  resetBridgeTokenCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid/");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const bridgeCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://bridge.")).length;

async function failTimes(n: number) {
  for (let i = 0; i < n; i++) await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
}

describe("bridge circuit breaker", () => {
  it("opens after five consecutive failures and skips without a request", async () => {
    await failTimes(5);
    expect(bridgeCalls()).toBe(5);
    const skipped = await bridgeAccountDelete("u1");
    expect(skipped).toEqual({ ok: false, kind: "error", skipped: true });
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("error");
    expect(bridgeCalls()).toBe(5);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "bridge", reason: "breaker_open", userId: "u1" });
  });

  it("covers every call type", async () => {
    await failTimes(5);
    const results = await Promise.all([
      bridgePasswordSet("u1", "pw"),
      bridgeAccountUpsert({ ahdUserId: "u1", username: "a", email: "a@b.c", emailVerified: true }),
      bridgeAccountDelete("u1"),
      bridgeLoginTicket("u1"),
    ]);
    for (const result of results) expect(result).toMatchObject({ ok: false, skipped: true });
    expect(bridgeCalls()).toBe(5);
  });

  it("does not open while successes break up the failures", async () => {
    await failTimes(4);
    bridgeUp = true;
    await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
    bridgeUp = false;
    await failTimes(4);
    expect(bridgeCalls()).toBe(9);
    await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
    expect(bridgeCalls()).toBe(10);
  });

  it("lets one trial through after the window and closes on success", async () => {
    await failTimes(5);
    await vi.advanceTimersByTimeAsync(29_000);
    await bridgeAccountDelete("u1");
    expect(bridgeCalls()).toBe(5);
    await vi.advanceTimersByTimeAsync(2_000);
    bridgeUp = true;
    expect(await bridgeLoginTicket("u1")).toEqual({ ok: true, data: "t1" });
    expect(bridgeCalls()).toBe(6);
    await bridgeLoginTicket("u1");
    await bridgeLoginTicket("u1");
    expect(bridgeCalls()).toBe(8);
  });

  it("reopens for a full window when the trial fails", async () => {
    await failTimes(5);
    await vi.advanceTimersByTimeAsync(31_000);
    await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
    expect(bridgeCalls()).toBe(6);
    await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
    expect(bridgeCalls()).toBe(6);
    await vi.advanceTimersByTimeAsync(31_000);
    await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
    expect(bridgeCalls()).toBe(7);
  });

  it("allows only one trial at a time", async () => {
    await failTimes(5);
    await vi.advanceTimersByTimeAsync(31_000);
    bridgeUp = true;
    const [a, b] = await Promise.all([bridgeLoginTicket("u1"), bridgeLoginTicket("u1")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(bridgeCalls()).toBe(6);
  });

  it("honours the threshold and window env", async () => {
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_BREAKER_FAILURES", "2");
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_BREAKER_OPEN_MS", "5000");
    await failTimes(2);
    await bridgeAccountDelete("u1");
    expect(bridgeCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(5_001);
    await bridgeAccountDelete("u1");
    expect(bridgeCalls()).toBe(3);
  });
});
