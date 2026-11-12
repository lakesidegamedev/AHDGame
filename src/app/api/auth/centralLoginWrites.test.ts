import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const log = vi.hoisted(() => ({
  order: [] as string[],
  events: [] as Record<string, unknown>[],
  bridgeBodies: [] as Record<string, unknown>[],
  bridge: "ok" as "ok" | "error" | "timeout",
  local: "ok" as "ok" | "lost" | "throw",
}));

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  requireBasicAuth: vi.fn(),
  parseJsonBody: vi.fn(),
  consumePasswordReset: vi.fn(),
  invalidateCachedUser: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ verifyAuth: mocks.verifyAuth }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: mocks.requireBasicAuth }));
vi.mock("@/lib/api/validate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validate")>()),
  parseJsonBody: mocks.parseJsonBody,
}));
vi.mock("bcryptjs", () => ({
  default: { compare: async () => true, hash: async () => "synthetic-new-digest" },
}));
vi.mock("@/lib/passwordReset", () => ({ consumePasswordReset: mocks.consumePasswordReset }));
vi.mock("@/lib/auth/userDocCache", () => ({ invalidateCachedUser: mocks.invalidateCachedUser }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/utils/network", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
  AUTH_LIMITS: { maxRequests: 10, windowMs: 60000 },
}));
vi.mock("@/lib/api/rateLimit.mongo", () => ({ durableRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/api/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/errors")>()),
  handleRouteError: () => new Response(null, { status: 500 }),
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: (name: string) =>
      name === "centralLoginShadowEvents"
        ? {
            insertOne: async (doc: Record<string, unknown>) => {
              log.events.push(doc);
              return { acknowledged: true };
            },
          }
        : {
            findOne: mocks.findOne,
            updateOne: async () => {
              log.order.push("local");
              if (log.local === "throw") throw new Error("write failed");
              return { acknowledged: true, matchedCount: log.local === "lost" ? 0 : 1 };
            },
          },
  }),
}));

import { POST as changePassword } from "./change-password/route";
import { POST as setPassword } from "./set-password/route";
import { POST as resetPassword } from "./reset-password/route";

const id = new ObjectId("000000000000000000000009");
const cutoff = new Date("2026-01-01T00:00:00Z");
const issuedAt = new Date("2026-01-02T00:00:00Z");
const request = () => new Request("https://game.example.invalid/x", { method: "POST" });

function setEnv(mode: string) {
  vi.stubEnv("AHD_CENTRAL_LOGIN_MODE", mode);
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
}

beforeEach(async () => {
  log.order = [];
  log.events = [];
  log.bridgeBodies = [];
  log.bridge = "ok";
  log.local = "ok";
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
      return new Response(JSON.stringify({ result: "ok" }));
    })
  );
  mocks.requireBasicAuth.mockResolvedValue({ ok: true, user: { userId: id.toHexString() } });
  mocks.parseJsonBody.mockResolvedValue({
    success: true,
    data: {
      currentPassword: "synthetic-current",
      newPassword: "synthetic-new-password",
      password: "synthetic-new-password",
      token: "synthetic-token",
    },
  });
  mocks.verifyAuth.mockResolvedValue({ userId: id.toHexString(), iat: issuedAt.getTime() / 1000 });
  mocks.consumePasswordReset.mockResolvedValue({ userId: id, createdAt: issuedAt });
  mocks.findOne.mockResolvedValue({ _id: id, password: "synthetic-old", authRevokedAt: cutoff });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const routes = [
  ["change-password", changePassword, "synthetic-old"],
  ["set-password", setPassword, undefined],
  ["reset-password", resetPassword, "synthetic-old"],
] as const;

describe.each(routes)("%s write ordering", (_name, route, password) => {
  beforeEach(() => {
    mocks.findOne.mockResolvedValue({ _id: id, password, authRevokedAt: cutoff });
  });

  it("off: zero bridge calls", async () => {
    setEnv("off");
    expect((await route(request())).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log.order).toEqual(["local"]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("central: writes the central credential before the local copy", async () => {
    setEnv("central");
    expect((await route(request())).status).toBe(200);
    expect(log.order).toEqual(["bridge:password-set", "local"]);
    expect(log.bridgeBodies[0]).toEqual({
      ahdUserId: id.toHexString(),
      password: "synthetic-new-password",
    });
  });

  it.each(["error", "timeout"] as const)(
    "central: refuses and leaves the local copy alone when the bridge fails (%s)",
    async (failure) => {
      setEnv("central");
      log.bridge = failure;
      const response = await route(request());
      expect(response.status).toBe(503);
      expect(log.order).toEqual(["bridge:password-set"]);
      expect(mocks.invalidateCachedUser).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(log.events[0]).toMatchObject({ kind: "write", op: "password-set", central: failure })
      );
    }
  );

  it("shadow: local first, mirrored after, and a bridge failure changes nothing", async () => {
    setEnv("shadow");
    log.bridge = "error";
    expect((await route(request())).status).toBe(200);
    await vi.waitFor(() => expect(log.order).toEqual(["local", "bridge:password-set"]));
    await vi.waitFor(() =>
      expect(log.events[0]).toMatchObject({
        kind: "write",
        op: "password-set",
        central: "error",
        match: false,
      })
    );
    expect(JSON.stringify(log.events)).not.toContain("synthetic-new-password");
  });

  it("shadow: a successful mirror is recorded as a match", async () => {
    setEnv("shadow");
    await route(request());
    await vi.waitFor(() => expect(log.events[0]).toMatchObject({ central: "ok", match: true }));
  });
});

describe.each(routes)("%s local failure and long passwords", (_name, route, password) => {
  beforeEach(() => {
    mocks.findOne.mockResolvedValue({
      _id: id,
      username: "synthetic-user",
      email: "synthetic@example.invalid",
      password,
      authRevokedAt: cutoff,
    });
  });

  it("central: restores the previous hash when the local write loses a race", async () => {
    setEnv("central");
    log.local = "lost";
    expect((await route(request())).status).toBe(409);
    expect(log.order).toEqual(
      password
        ? ["bridge:password-set", "local", "bridge:account-upsert"]
        : ["bridge:password-set", "local"]
    );
    if (password) {
      expect(log.bridgeBodies[1]).toMatchObject({
        ahdUserId: id.toHexString(),
        passwordHash: "synthetic-old",
        email: "synthetic@example.invalid",
      });
      expect(log.bridgeBodies[1]).not.toHaveProperty("discordId");
      expect(JSON.stringify(log.bridgeBodies[1])).not.toContain("synthetic-new-password");
    }
    await vi.waitFor(() =>
      expect(
        log.events.some((e) => e.reason === (password ? "restore" : "restore_unavailable"))
      ).toBe(true)
    );
  });

  it("central: restores when the local write throws, then surfaces the error", async () => {
    setEnv("central");
    log.local = "throw";
    expect((await route(request())).status).toBe(500);
    if (password)
      expect(log.order).toEqual(["bridge:password-set", "local", "bridge:account-upsert"]);
  });

  it("shadow and off: a failed local write never calls the bridge to restore", async () => {
    for (const mode of ["off", "shadow"]) {
      log.order = [];
      setEnv(mode);
      log.local = "lost";
      await route(request());
      expect(log.order).toEqual(["local"]);
    }
  });

  it.each(["shadow", "central"])("%s: refuses a password of 72 bytes or more", async (mode) => {
    setEnv(mode);
    const long = "x".repeat(72);
    mocks.parseJsonBody.mockResolvedValue({
      success: true,
      data: { currentPassword: "c", newPassword: long, password: long, token: "t" },
    });
    const response = await route(request());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Use a password under 72 bytes");
    expect(log.order).toEqual([]);
    expect(mocks.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("counts bytes, not characters, and accepts 71 bytes", async () => {
    setEnv("central");
    const multibyte = "é".repeat(36);
    mocks.parseJsonBody.mockResolvedValue({
      success: true,
      data: { currentPassword: "c", newPassword: multibyte, password: multibyte, token: "t" },
    });
    expect((await route(request())).status).toBe(400);
    const ok = "x".repeat(71);
    mocks.parseJsonBody.mockResolvedValue({
      success: true,
      data: { currentPassword: "c", newPassword: ok, password: ok, token: "t" },
    });
    expect((await route(request())).status).toBe(200);
  });

  it("off: keeps today's rule and accepts a long password", async () => {
    setEnv("off");
    const long = "x".repeat(100);
    mocks.parseJsonBody.mockResolvedValue({
      success: true,
      data: { currentPassword: "c", newPassword: long, password: long, token: "t" },
    });
    expect((await route(request())).status).toBe(200);
  });
});
