import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const state = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  aggregateRows: [] as unknown[],
  pipeline: null as unknown,
}));

vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: () => ({
      insertOne: async (doc: Record<string, unknown>) => {
        state.events.push(doc);
        return { acknowledged: true };
      },
      aggregate: (pipeline: unknown) => {
        state.pipeline = pipeline;
        return { toArray: async () => state.aggregateRows };
      },
    }),
  }),
}));

import {
  bridgeAccountFromUser,
  centralRollbackCreate,
  centralWriteFirst,
  getCentralLoginMode,
  shadowMirrorWrite,
  shadowRecordProviderLogin,
} from "./index";
import { resetBridgeTokenCache } from "./bridgeClient";
import { summarizeShadowEvents } from "./shadowEvents";

const uid = new ObjectId("00000000000000000000000a");
let bridgeStatus = 200;

function env(mode: string) {
  vi.stubEnv("AHD_CENTRAL_LOGIN_MODE", mode);
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
}

beforeEach(() => {
  state.events = [];
  bridgeStatus = 200;
  resetBridgeTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("token.example")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));
      }
      return new Response(
        JSON.stringify({ result: url.endsWith("account-upsert") ? "updated" : "ok" }),
        {
          status: bridgeStatus,
        }
      );
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const upsert = {
  op: "account-upsert",
  account: bridgeAccountFromUser({ _id: uid, username: "a", email: "a@example.invalid" }),
} as const;
const del = { op: "account-delete", ahdUserId: uid.toHexString() } as const;

describe("mode switch", () => {
  it("reads off, shadow and central from one place", () => {
    env("shadow");
    expect(getCentralLoginMode()).toBe("shadow");
    env("central");
    expect(getCentralLoginMode()).toBe("central");
    env("");
    expect(getCentralLoginMode()).toBe("off");
  });
});

describe("write helpers", () => {
  it("off: no bridge calls and writes are allowed", async () => {
    env("off");
    expect(await centralWriteFirst(upsert)).toBe(true);
    expect(await centralWriteFirst(del)).toBe(true);
    shadowMirrorWrite(del);
    shadowRecordProviderLogin(uid.toHexString(), "apple");
    await centralRollbackCreate(uid.toHexString());
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(state.events).toEqual([]);
  });

  it("central: allows the write only when the bridge accepts it", async () => {
    env("central");
    expect(await centralWriteFirst(upsert)).toBe(true);
    expect(await centralWriteFirst(del)).toBe(true);
    bridgeStatus = 500;
    expect(await centralWriteFirst(upsert)).toBe(false);
    expect(await centralWriteFirst(del)).toBe(false);
  });

  it("central: rollback deletes the central account", async () => {
    env("central");
    await centralRollbackCreate(uid.toHexString());
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith("account-delete"))).toBe(true);
  });

  it("shadow: provider logins record a skipped comparison, never calling the bridge", async () => {
    env("shadow");
    shadowRecordProviderLogin(uid.toHexString(), "discord");
    await vi.waitFor(() => expect(state.events).toHaveLength(1));
    expect(state.events[0]).toMatchObject({ kind: "discord", local: "ok", central: "n/a" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("central: provider logins record nothing", () => {
    env("central");
    shadowRecordProviderLogin(uid.toHexString(), "google");
    expect(state.events).toEqual([]);
  });
});

describe("bridgeAccountFromUser", () => {
  it("sends no provider ids unless named, and clears one with a null override", () => {
    const user = { _id: uid, username: "a", email: "a@example.invalid" };
    const plain = bridgeAccountFromUser(user);
    expect(plain).toEqual({
      ahdUserId: uid.toHexString(),
      username: "a",
      email: "a@example.invalid",
      emailVerified: false,
    });
    expect(plain).not.toHaveProperty("discordId");
    expect(plain).not.toHaveProperty("googleId");
    expect(plain).not.toHaveProperty("appleId");
    expect(bridgeAccountFromUser(user, { discordId: null })).toMatchObject({ discordId: null });
  });
});

describe("summarizeShadowEvents", () => {
  it("buckets match, mismatch, error, timeout and fallback", async () => {
    state.aggregateRows = [
      { _id: { match: true, central: "ok", fallback: false }, count: 5 },
      { _id: { match: false, central: "wrong", fallback: false }, count: 2 },
      { _id: { match: false, central: "unknown", fallback: false }, count: 1 },
      { _id: { match: false, central: "error", fallback: true }, count: 3 },
      { _id: { match: false, central: "timeout", fallback: false }, count: 4 },
      { _id: { match: false, central: "n/a", fallback: false }, count: 7 },
      { _id: { match: false, central: "n/a", fallback: false, reason: "long_password" }, count: 6 },
      { _id: { match: false, central: "unknown", fallback: false, reason: "unknown_heal" }, count: 2 },
    ];
    const now = new Date("2026-01-02T00:00:00Z");
    const summary = await summarizeShadowEvents(3600_000, now);
    expect(summary).toMatchObject({
      total: 30,
      match: 5,
      mismatch: 3,
      error: 3,
      timeout: 4,
      fallback: 3,
      longPassword: 6,
      unknownHeal: 2,
    });
    expect(summary.windowStart).toEqual(new Date("2026-01-01T23:00:00Z"));
    expect(JSON.stringify(state.pipeline)).toContain("$match");
  });
});
