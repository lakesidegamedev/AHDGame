import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

const log = vi.hoisted(() => ({
  order: [] as string[],
  events: [] as Record<string, unknown>[],
  bridgeBodies: [] as Record<string, unknown>[],
  bridge: "ok" as "ok" | "error" | "timeout",
  insertFails: false,
  linkWrite: "ok" as "ok" | "throw" | "lost",
  account: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/analytics/intakeEvents", () => ({ captureIntakeEvent: vi.fn() }));
vi.mock("@/lib/analytics/acquisition", () => ({
  ACQUISITION_COOKIE: "acq",
  acquisitionEventProperties: () => ({}),
  parseAcquisition: () => null,
}));
vi.mock("@/lib/identityHistory/recordObservation", () => ({ recordIdentitySignals: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getJwtSecret: () => new TextEncoder().encode("synthetic-secret-for-tests-0123456789"),
  getAuthCookieOptions: async () => ({}),
  getTrackingCookieOptions: async () => ({}),
  getAuthUser: async () => ({ userId: "000000000000000000000021" }),
  verifyAuth: async () => ({ iat: 1 }),
}));
vi.mock("@/lib/auth/credentialSession", () => ({ credentialSessionIsCurrent: () => true }));
vi.mock("@/lib/auth/providerLinkContext", () => ({
  providerLinkContextCookieName: () => "ctx",
  verifyProviderLinkContext: () => ({ ok: true }),
}));
vi.mock("@/lib/auth/characterGate", () => ({ needsCharacterHint: () => false }));
vi.mock("@/lib/auth/characterGateCookie", () => ({ setCharacterGateCookie: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/auth/referralCode", () => ({ resolveReferredByFromOAuthCookie: async () => null }));
vi.mock("@/lib/utils/network", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/auth/registrationGate", () => ({ assertRegistrationAllowed: async () => ({}) }));
vi.mock("@/lib/ip/ipteoh", () => ({ checkIpFireAndForget: async () => null }));
vi.mock("@/lib/auth/lakesideLoginReturn", () => ({
  loginDestination: () => "/",
  takeOAuthReturnUrlCookie: () => undefined,
}));
vi.mock("@/lib/auth/userDocCache", () => ({ invalidateCachedUser: vi.fn() }));
const hopMock = vi.hoisted(() => ({
  start: vi.fn(async (_input: unknown): Promise<string | null> => null),
}));
const readyMock = vi.hoisted(() => ({ ready: vi.fn(async (): Promise<boolean> => true) }));
vi.mock("@/lib/auth/centralLogin/issuerReadiness", () => ({ isHopIssuerReady: readyMock.ready }));
vi.mock("@/lib/auth/centralLogin/hop", () => ({
  startLakesideHop: hopMock.start,
  recordHopSkipped: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/repositories/gameConfig", () => ({
  gameConfigCollection: () => ({ findOne: async () => ({}) }),
}));
vi.mock("@/lib/db/repositories/activityLog", () => ({
  activityLogCollection: () => ({ insertOne: async () => ({}) }),
}));
vi.mock("@/lib/db/repositories/users", () => ({
  usersCollection: () => ({
    findOne: async (filter: Record<string, unknown>) => {
      if ("_id" in filter && !("$ne" in Object(filter._id))) return log.account;
      return null;
    },
    insertOne: async (doc: Record<string, unknown>) => {
      log.order.push("local-insert");
      if (log.insertFails) throw new Error("insert failed");
      return { acknowledged: true, insertedId: doc._id };
    },
    updateOne: async () => {
      log.order.push("local-update");
      if (log.linkWrite === "throw") throw new Error("write failed");
      return { acknowledged: true, matchedCount: log.linkWrite === "lost" ? 0 : 1 };
    },
  }),
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: () => ({
      insertOne: async (doc: Record<string, unknown>) => {
        log.events.push(doc);
        return { acknowledged: true };
      },
    }),
  }),
}));

import { runOAuthLogin } from "./providerLogin";
import { runOAuthLink } from "./providerLink";
import type { OAuthCookieStore, OAuthDb, OAuthLinkAdapter, OAuthLoginAdapter } from "./types";

const cookieStore = {
  get: () => undefined,
  set: vi.fn(),
  delete: vi.fn(),
} as unknown as OAuthCookieStore;
const db = {} as OAuthDb;

const loginAdapter = {
  provider: "google",
  idField: "googleId",
  externalId: "synthetic-sub",
  returnUrlCookie: "ret",
  resultRedirect: (status: string, next: string, reason?: string) =>
    NextResponse.json({ status, next, reason }),
  existingLoginFields: () => ({}),
  newAccount: {
    usernameSeed: () => "newplayer",
    fallbackUsername: () => "player_fallback",
    email: "synthetic@example.invalid",
    displayName: (u: string) => u,
    fields: () => ({ googleId: "synthetic-sub" }),
    adminLogDetails: "x",
    welcomeMessage: "hi",
    softAllowSeparator: ",",
    ipDetection: "lookup",
  },
} as unknown as OAuthLoginAdapter;

const linkAdapter = {
  provider: "google",
  idField: "googleId",
  externalId: "synthetic-sub",
  loginRequired: () => NextResponse.json({ status: "login" }),
  linkResult: (status: string, reason?: string) => NextResponse.json({ status, reason }),
  linkFields: () => ({ googleId: "synthetic-sub" }),
} as unknown as OAuthLinkAdapter;

function setEnv(mode: string) {
  vi.stubEnv("AHD_CENTRAL_LOGIN_MODE", mode);
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
}

beforeEach(async () => {
  Object.assign(log, {
    order: [],
    events: [],
    bridgeBodies: [],
    bridge: "ok",
    insertFails: false,
    linkWrite: "ok",
    account: {
      _id: new ObjectId("000000000000000000000021"),
      username: "linker",
      email: "linker@example.invalid",
      password: "synthetic-hash",
    },
  });
  const { resetBridgeTokenCache } = await import("@/lib/auth/centralLogin/bridgeClient");
  resetBridgeTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("token.example")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));
      }
      log.order.push(`bridge:${url.replace("https://bridge.example.invalid/", "")}`);
      log.bridgeBodies.push(JSON.parse(String(init.body)));
      if (log.bridge === "timeout") throw Object.assign(new Error("x"), { name: "TimeoutError" });
      if (log.bridge === "error") return new Response("{}", { status: 500 });
      return new Response(JSON.stringify({ result: "updated" }));
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const signUp = () =>
  runOAuthLogin(db, loginAdapter, cookieStore, "https://game.example.invalid", null, {} as never);

describe("OAuth sign-up", () => {
  it("off: no bridge call", async () => {
    setEnv("off");
    await signUp();
    expect(log.order).toContain("local-insert");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("central: creates the central account first and sends only the new provider id", async () => {
    setEnv("central");
    await signUp();
    expect(log.order.slice(0, 2)).toEqual(["bridge:account-upsert", "local-insert"]);
    expect(log.bridgeBodies[0]).toMatchObject({ googleId: "synthetic-sub", emailVerified: false });
    expect(log.bridgeBodies[0]).not.toHaveProperty("discordId");
    expect(log.bridgeBodies[0]).not.toHaveProperty("appleId");
    expect(log.bridgeBodies[0]).not.toHaveProperty("passwordHash");
  });

  it.each(["error", "timeout"] as const)(
    "central: refuses when the bridge fails (%s)",
    async (f) => {
      setEnv("central");
      log.bridge = f;
      const body = await (await signUp()).json();
      expect(body).toMatchObject({ status: "error", reason: "exchange_failed" });
      expect(log.order).toEqual(["bridge:account-upsert"]);
    }
  );

  it("central: rolls the central account back when the local insert fails", async () => {
    setEnv("central");
    log.insertFails = true;
    await expect(signUp()).rejects.toThrow("insert failed");
    expect(log.order).toContain("bridge:account-delete");
  });

  it("shadow: mirrors after the local insert and a bridge failure is only an event", async () => {
    setEnv("shadow");
    log.bridge = "error";
    await signUp();
    await vi.waitFor(() =>
      expect(log.events[0]).toMatchObject({ kind: "write", op: "account-upsert", central: "error" })
    );
    expect(log.order.indexOf("local-insert")).toBeLessThan(
      log.order.indexOf("bridge:account-upsert")
    );
  });
});

const link = () => runOAuthLink(db, linkAdapter, cookieStore, "state");

describe("OAuth provider link", () => {
  it("off: no bridge call", async () => {
    setEnv("off");
    expect((await (await link()).json()).status).toBe("success");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("central: writes the provider id centrally first, other fields absent", async () => {
    setEnv("central");
    expect((await (await link()).json()).status).toBe("success");
    expect(log.order).toEqual(["bridge:account-upsert", "local-update"]);
    expect(log.bridgeBodies[0]).toMatchObject({ googleId: "synthetic-sub" });
    expect(log.bridgeBodies[0]).not.toHaveProperty("discordId");
    expect(log.bridgeBodies[0]).not.toHaveProperty("appleId");
  });

  it.each(["error", "timeout"] as const)(
    "central: refuses when the bridge fails (%s)",
    async (f) => {
      setEnv("central");
      log.bridge = f;
      expect(await (await link()).json()).toMatchObject({
        status: "error",
        reason: "exchange_failed",
      });
      expect(log.order).toEqual(["bridge:account-upsert"]);
    }
  );

  it.each(["throw", "lost"] as const)(
    "central: clears the central provider id when the local write fails (%s)",
    async (mode) => {
      setEnv("central");
      log.linkWrite = mode;
      expect((await (await link()).json()).status).toBe("error");
      expect(log.order).toEqual(["bridge:account-upsert", "local-update", "bridge:account-upsert"]);
      expect(log.bridgeBodies[1]).toMatchObject({ googleId: null });
      await vi.waitFor(() => expect(log.events.some((e) => e.reason === "restore")).toBe(true));
    }
  );

  it("shadow: mirrors after the local write", async () => {
    setEnv("shadow");
    await link();
    await vi.waitFor(() => expect(log.order).toEqual(["local-update", "bridge:account-upsert"]));
  });
});

describe("OAuth login session hop", () => {
  const redirectAdapter = {
    ...loginAdapter,
    resultRedirect: (status: string, next: string) => {
      const res = NextResponse.redirect(
        new URL(`/result?s=${status}&n=${next}`, "https://game.example.invalid")
      );
      res.headers.set("Cache-Control", "no-store");
      return res;
    },
  } as unknown as OAuthLoginAdapter;
  const run = () =>
    runOAuthLogin(
      db,
      redirectAdapter,
      cookieStore,
      "https://game.example.invalid",
      null,
      {} as never
    );

  beforeEach(() => {
    hopMock.start.mockReset();
    readyMock.ready.mockReset();
    readyMock.ready.mockResolvedValue(true);
  });

  it.each(["off", "shadow"])("%s: never starts a hop", async (mode) => {
    setEnv(mode);
    hopMock.start.mockResolvedValue("https://issuer.example.invalid/auth");
    const res = await run();
    expect(hopMock.start).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/result?s=login_success");
  });

  it("central: redirects to the hop url and keeps the normal destination for later", async () => {
    setEnv("central");
    hopMock.start.mockResolvedValue("https://issuer.example.invalid/auth?x=1");
    const res = await run();
    expect(res.headers.get("location")).toBe("https://issuer.example.invalid/auth?x=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(hopMock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "https://game.example.invalid/result?s=login_success&n=/",
      })
    );
  });

  it("central: an issuer that is not ready falls back to the destination", async () => {
    setEnv("central");
    readyMock.ready.mockResolvedValue(false);
    hopMock.start.mockResolvedValue("https://issuer.example.invalid/auth");
    const res = await run();
    expect(hopMock.start).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/result?s=login_success");
  });

  it("central: linking a provider never starts a hop", async () => {
    setEnv("central");
    hopMock.start.mockResolvedValue("https://issuer.example.invalid/auth");
    await runOAuthLink(db, linkAdapter, cookieStore, "state");
    expect(hopMock.start).not.toHaveBeenCalled();
    expect(readyMock.ready).not.toHaveBeenCalled();
  });

  it("central: a skipped hop leaves the normal redirect", async () => {
    setEnv("central");
    hopMock.start.mockResolvedValue(null);
    const res = await run();
    expect(res.headers.get("location")).toContain("/result?s=login_success");
  });
});
