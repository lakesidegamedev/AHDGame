import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  events: [] as Record<string, unknown>[],
  flows: new Map<string, Record<string, unknown>>(),
  jar: new Map<string, string>(),
  setNames: [] as string[],
  ticketCalls: 0,
  ticketStatus: 200,
  tokenCalls: 0,
  idToken: "",
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { value: state.jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      state.setNames.push(name);
      state.jar.set(name, value);
    },
    delete: (name: string) => {
      state.jar.delete(name);
    },
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: () => ({}),
    jwtVerify: async (token: string, ...rest: unknown[]) => {
      if (token.startsWith("id.")) {
        const [, nonce, ahd] = token.split(".");
        return { payload: { sub: "kc-1", nonce, ahd_user_id: ahd } };
      }
      return (actual.jwtVerify as (...args: unknown[]) => unknown)(token, ...rest);
    },
  };
});
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
  resolveReauthIssuedAt: async () => ({
    ok: true,
    iat: Math.floor(Date.now() / 1000),
    snapshotFilter: {},
  }),
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
      if (name === "lakesideHopFlows") {
        return {
          insertOne: async (doc: Record<string, unknown>) => {
            state.flows.set(String(doc._id), doc);
            return { acknowledged: true };
          },
          findOneAndDelete: async (filter: { _id: string }) => {
            const flow = state.flows.get(filter._id) ?? null;
            state.flows.delete(filter._id);
            return flow;
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
import { GET as callback } from "./lakeside-hop/callback/route";
import { AUTH_COOKIE_NAME } from "@/lib/authCookieName";

const userId = new ObjectId("000000000000000000000009");
const otherId = new ObjectId("00000000000000000000000a");
const localHash = bcrypt.hashSync("right-password", 4);
const ISSUER = "https://issuer.example.invalid/realms/r";

function loginRequest(body: Record<string, unknown> = {}) {
  return new Request("https://game.example.invalid/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "player@example.invalid", password: "right-password", ...body }),
  });
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "https://token.example.invalid/token") {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));
      }
      if (url === "https://bridge.example.invalid/login-ticket") {
        state.ticketCalls++;
        return state.ticketStatus === 200
          ? new Response(JSON.stringify({ ticket: "synthetic-ticket" }))
          : new Response("{}", { status: state.ticketStatus });
      }
      if (url.startsWith("https://bridge.example.invalid/")) {
        return new Response(JSON.stringify({ result: "ok", enabled: true }));
      }
      if (url === `${ISSUER}/protocol/openid-connect/token`) {
        state.tokenCalls++;
        expect(String(init.body)).toContain("code_verifier=");
        return new Response(JSON.stringify({ id_token: state.idToken }));
      }
      return new Response("{}", { status: 404 });
    })
  );
}

function configure(mode: string, withIssuer = true) {
  vi.stubEnv("AHD_CENTRAL_LOGIN_MODE", mode);
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
  if (withIssuer) {
    vi.stubEnv("UNIFIED_OIDC_ISSUER", ISSUER);
    vi.stubEnv("UNIFIED_OIDC_CLIENT_ID", "ahd-web");
    vi.stubEnv("UNIFIED_OIDC_CLIENT_SECRET", "synthetic-web-secret");
  }
}

const hopEvents = () => state.events.filter((e) => e.kind === "hop");
const bridgeCheckOk = () => {
  // password-check answers ok so central login accepts the right password
};

beforeEach(async () => {
  state.events = [];
  state.flows.clear();
  state.jar.clear();
  state.setNames = [];
  state.ticketCalls = 0;
  state.ticketStatus = 200;
  state.tokenCalls = 0;
  state.user = {
    _id: userId,
    email: "player@example.invalid",
    username: "player",
    password: localHash,
    role: "player",
    hasCompletedSetup: true,
  };
  const { resetBridgeTokenCache } = await import("@/lib/auth/centralLogin/bridgeClient");
  resetBridgeTokenCache();
  stubFetch();
  bridgeCheckOk();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function loginAndHop(body: Record<string, unknown> = {}) {
  const res = await login(loginRequest(body));
  const json = await res.json();
  return { res, json, hop: json.lakesideHop ? new URL(json.lakesideHop as string) : null };
}

function callbackRequest(params: Record<string, string>) {
  const url = new URL("https://game.example.invalid/api/auth/lakeside-hop/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url);
}

describe("session hop on password login", () => {
  it.each(["off", "shadow"])(
    "adds nothing in %s mode and never asks for a ticket",
    async (mode) => {
      configure(mode);
      const { res, json } = await loginAndHop();
      expect(res.status).toBe(200);
      expect(json.lakesideHop).toBeUndefined();
      expect(state.ticketCalls).toBe(0);
      expect(state.flows.size).toBe(0);
      expect(hopEvents()).toEqual([]);
    }
  );

  it("shadow: a listed test user gets the central decision and a hop, others do not", async () => {
    configure("shadow");
    vi.stubEnv("AHD_CENTRAL_LOGIN_TEST_USERS", userId.toHexString());
    const listed = await loginAndHop();
    expect(listed.hop).not.toBeNull();
    expect(state.ticketCalls).toBe(1);

    state.ticketCalls = 0;
    state.user = { ...state.user, _id: otherId };
    const unlisted = await loginAndHop();
    expect(unlisted.json.lakesideHop).toBeUndefined();
    expect(state.ticketCalls).toBe(0);
  });

  it("off: the test user list does nothing", async () => {
    configure("off");
    vi.stubEnv("AHD_CENTRAL_LOGIN_TEST_USERS", userId.toHexString());
    const { json } = await loginAndHop();
    expect(json.lakesideHop).toBeUndefined();
    expect(state.ticketCalls).toBe(0);
  });

  it("central: returns the issuer authorization url and stores the flow", async () => {
    configure("central");
    const { json, hop } = await loginAndHop({ returnTo: null });
    expect(json.message).toBe("Login successful");
    expect(hop).toBeDefined();
    expect(hop!.origin + hop!.pathname).toBe(`${ISSUER}/protocol/openid-connect/auth`);
    expect(Object.fromEntries(hop!.searchParams)).toMatchObject({
      client_id: "ahd-web",
      scope: "openid",
      response_type: "code",
      code_challenge_method: "S256",
      lakeside_ticket: "synthetic-ticket",
      redirect_uri: "https://game.example.invalid/api/auth/lakeside-hop/callback",
    });
    expect(state.flows.size).toBe(1);
    const flow = [...state.flows.values()][0];
    expect(flow).toMatchObject({ userId: userId.toHexString(), destination: "/profile" });
    expect(state.jar.get("ahd_lakeside_hop")).toBe(flow._id);
  });

  it("central: no ticket means the plain response", async () => {
    configure("central");
    state.ticketStatus = 500;
    const { res, json } = await loginAndHop();
    expect(res.status).toBe(200);
    expect(json.lakesideHop).toBeUndefined();
    expect(state.jar.has(AUTH_COOKIE_NAME)).toBe(true);
    expect(hopEvents()).toEqual([
      expect.objectContaining({ hop: "failed", reason: "hop_ticket_failed", match: false }),
    ]);
  });

  it("central: no issuer configuration skips the hop without a ticket call", async () => {
    configure("central", false);
    const { json } = await loginAndHop();
    expect(json.lakesideHop).toBeUndefined();
    expect(state.ticketCalls).toBe(0);
  });
});

describe("session hop callback", () => {
  async function startHop() {
    configure("central");
    const { hop } = await loginAndHop();
    const params = hop!.searchParams;
    return { state: params.get("state")!, nonce: params.get("nonce")! };
  }

  it("redirects to the stored destination and records success", async () => {
    const hop = await startHop();
    state.idToken = `id.${hop.nonce}.${userId.toHexString()}`;
    const before = state.setNames.length;
    const res = await callback(callbackRequest({ code: "c1", state: hop.state }));
    expect(res.headers.get("location")).toBe("https://game.example.invalid/profile");
    expect(state.tokenCalls).toBe(1);
    expect(hopEvents()).toEqual([expect.objectContaining({ hop: "ok", match: true })]);
    expect(state.setNames.length).toBe(before);
    expect(state.flows.size).toBe(0);
  });

  it.each([
    ["state mismatch", "hop_state", () => ({ state: "wrong" }), 0],
    ["nonce mismatch", "hop_nonce", () => ({}), 1],
    ["wrong ahd_user_id", "hop_user_mismatch", () => ({}), 1],
  ])("falls through on %s", async (name, reason, extra, tokenCalls) => {
    const hop = await startHop();
    const claimUser = name === "wrong ahd_user_id" ? otherId.toHexString() : userId.toHexString();
    state.idToken = `id.${name === "nonce mismatch" ? "bad" : hop.nonce}.${claimUser}`;
    const before = state.setNames.length;
    const res = await callback(callbackRequest({ code: "c1", state: hop.state, ...extra() }));
    expect(res.headers.get("location")).toBe("https://game.example.invalid/profile");
    expect(state.tokenCalls).toBe(tokenCalls);
    expect(hopEvents()).toEqual([expect.objectContaining({ hop: "failed", reason })]);
    // Nobody is signed in or out by the callback.
    expect(state.setNames.length).toBe(before);
  });

  it("falls through when the hop cookie is missing", async () => {
    const hop = await startHop();
    state.jar.delete("ahd_lakeside_hop");
    const res = await callback(callbackRequest({ code: "c1", state: hop.state }));
    expect(res.headers.get("location")).toBe("https://game.example.invalid/");
    expect(hopEvents()).toEqual([
      expect.objectContaining({ hop: "failed", reason: "hop_no_flow" }),
    ]);
  });

  it("falls through when the browser has no AHD session", async () => {
    const hop = await startHop();
    state.idToken = `id.${hop.nonce}.${userId.toHexString()}`;
    state.jar.delete(AUTH_COOKIE_NAME);
    const res = await callback(callbackRequest({ code: "c1", state: hop.state }));
    expect(res.headers.get("location")).toBe("https://game.example.invalid/profile");
    expect(hopEvents()).toEqual([
      expect.objectContaining({ hop: "failed", reason: "hop_no_session" }),
    ]);
  });

  it("falls through when the provider reports an error", async () => {
    const hop = await startHop();
    const res = await callback(callbackRequest({ error: "access_denied", state: hop.state }));
    expect(res.headers.get("location")).toBe("https://game.example.invalid/profile");
    expect(state.tokenCalls).toBe(0);
    expect(hopEvents()).toEqual([
      expect.objectContaining({ hop: "failed", reason: "hop_provider_error" }),
    ]);
  });
});
