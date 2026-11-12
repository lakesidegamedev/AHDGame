import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  events: [] as Record<string, unknown>[],
  bridgeCalls: [] as { path: string; body: Record<string, unknown> }[],
  bridgeAnswer: (() => ({ status: 200, body: { result: "ok" } })) as () => {
    status: number;
    body?: unknown;
    throwName?: string;
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/utils/network", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/api/rateLimit.mongo", () => ({ durableRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identityHistory/recordObservation", () => ({ recordIdentitySignals: vi.fn() }));
vi.mock("@/lib/ip/ipteoh", () => ({ checkIpFireAndForget: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getJwtSecret: () => new TextEncoder().encode("synthetic-secret-for-tests-0123456789"),
  getAuthCookieOptions: async () => ({}),
  getTrackingCookieOptions: async () => ({}),
}));
vi.mock("@/lib/auth/sessionIssue", () => ({
  resolveReauthIssuedAt: async () => ({ ok: true, iat: 1, snapshotFilter: {} }),
}));
vi.mock("@/lib/auth/characterGateCookie", () => ({ setCharacterGateCookie: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: (name: string) => {
      if (name === "centralLoginShadowEvents") {
        return {
          insertOne: async (doc: Record<string, unknown>) => {
            state.events.push(doc);
            return { acknowledged: true };
          },
        };
      }
      return {
        findOne: async (filter: Record<string, unknown>) =>
          "$or" in filter ? state.user : { ipDetectionEnabled: false },
        updateOne: async () => ({ acknowledged: true, matchedCount: 1 }),
        insertOne: async () => ({ acknowledged: true }),
      };
    },
  }),
}));

import { POST as login } from "./login/route";

const userId = new ObjectId("000000000000000000000007");
const localHash = bcrypt.hashSync("right-password", 4);

function loginRequest(password: string) {
  return new Request("https://game.example.invalid/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "player@example.invalid", password }),
  });
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "https://token.example.invalid/token") {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));
      }
      const path = url.replace("https://bridge.example.invalid/", "");
      state.bridgeCalls.push({ path, body: JSON.parse(String(init.body)) });
      const answer = state.bridgeAnswer();
      if (answer.throwName) throw Object.assign(new Error("x"), { name: answer.throwName });
      return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
    })
  );
}

function setBridge(central: "ok" | "wrong" | "disabled" | "unknown" | "error" | "timeout") {
  state.bridgeAnswer = () => {
    if (central === "timeout") return { status: 0, throwName: "TimeoutError" };
    if (central === "error") return { status: 500 };
    return { status: 200, body: { result: central, enabled: true } };
  };
}

function setMode(mode: string | undefined) {
  vi.stubEnv("AHD_CENTRAL_LOGIN_MODE", mode ?? "");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
}

type Central = "ok" | "wrong" | "disabled" | "unknown" | "error" | "timeout";
const OUTCOMES: Central[] = ["ok", "wrong", "disabled", "unknown", "error", "timeout"];

beforeEach(async () => {
  state.events = [];
  state.bridgeCalls = [];
  state.user = {
    _id: userId,
    email: "player@example.invalid",
    username: "player",
    password: localHash,
    role: "player",
  };
  const { resetBridgeTokenCache } = await import("@/lib/auth/centralLogin/bridgeClient");
  resetBridgeTokenCache();
  stubFetch();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("password login, mode off", () => {
  it.each([undefined, "off", "bogus"])("makes zero bridge calls (mode %s)", async (mode) => {
    setMode(mode);
    setBridge("wrong");
    expect((await login(loginRequest("right-password"))).status).toBe(200);
    expect((await login(loginRequest("nope"))).status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(state.events).toEqual([]);
  });

  it("makes zero bridge calls when switched on without bridge config", async () => {
    setMode("central");
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "");
    expect((await login(loginRequest("right-password"))).status).toBe(200);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("password login, shadow mode", () => {
  for (const local of ["right-password", "wrong-password"]) {
    it.each(OUTCOMES)(
      `local decides (${local}) and central %s is only recorded`,
      async (central) => {
        setMode("shadow");
        setBridge(central);
        const expected = local === "right-password" ? 200 : 401;
        expect((await login(loginRequest(local))).status).toBe(expected);
        await vi.waitFor(() => expect(state.events).toHaveLength(1));
        const event = state.events[0];
        expect(event).toMatchObject({
          userId: userId.toString(),
          kind: "password",
          local: expected === 200 ? "ok" : "wrong",
          central,
        });
        expect(event.match).toBe(
          expected === 200 ? central === "ok" : central === "wrong" || central === "disabled"
        );
        expect(state.bridgeCalls[0].path).toBe("password-check");
        expect(state.bridgeCalls[0].body).not.toHaveProperty("enforceEnabled");
        expect(JSON.stringify(event)).not.toContain("password-check");
        expect(JSON.stringify(event)).not.toContain("example.invalid");
        expect(JSON.stringify(event)).not.toContain(localHash);
      }
    );
  }

  it("does not make the response wait for the bridge", async () => {
    setMode("shadow");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("token.example")) {
          return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));
        }
        await gate;
        return new Response(JSON.stringify({ result: "ok" }));
      })
    );
    expect((await login(loginRequest("right-password"))).status).toBe(200);
    expect(state.events).toEqual([]);
    release();
    await vi.waitFor(() => expect(state.events).toHaveLength(1));
  });
});

describe("password login, central mode", () => {
  it("asks the bridge with enforceEnabled", async () => {
    setMode("central");
    setBridge("ok");
    await login(loginRequest("right-password"));
    expect(state.bridgeCalls[0]).toEqual({
      path: "password-check",
      body: { ahdUserId: userId.toString(), password: "right-password", enforceEnabled: true },
    });
  });

  it("signs in on ok even when the local copy is stale", async () => {
    setMode("central");
    setBridge("ok");
    expect((await login(loginRequest("newer-central-password"))).status).toBe(200);
    expect(state.events).toEqual([]);
  });

  it.each(["wrong", "disabled", "unknown"] as const)(
    "rejects on %s and never falls back, even with a matching local password",
    async (central) => {
      setMode("central");
      setBridge(central);
      const response = await login(loginRequest("right-password"));
      expect(response.status).toBe(401);
      expect((await response.json()).error).toBe("Invalid credentials");
      expect(state.events).toEqual([]);
    }
  );

  it.each(["error", "timeout"] as const)("falls back to the local check on %s", async (central) => {
    setMode("central");
    setBridge(central);
    expect((await login(loginRequest("right-password"))).status).toBe(200);
    await vi.waitFor(() => expect(state.events).toHaveLength(1));
    expect(state.events[0]).toMatchObject({
      kind: "password",
      local: "ok",
      central,
      match: false,
      fallback: true,
    });

    state.events = [];
    expect((await login(loginRequest("wrong-password"))).status).toBe(401);
    await vi.waitFor(() => expect(state.events).toHaveLength(1));
    expect(state.events[0]).toMatchObject({ local: "wrong", central, fallback: true });
  });

  it("rejects an account with no local password without a bridge call", async () => {
    setMode("central");
    setBridge("ok");
    state.user = { ...state.user, password: "" };
    expect((await login(loginRequest("anything"))).status).toBe(401);
    expect(state.bridgeCalls).toEqual([]);
  });
});
