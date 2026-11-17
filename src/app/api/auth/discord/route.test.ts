import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  verifyAuth: vi.fn(),
  findOne: vi.fn(),
  set: vi.fn(),
  audit: vi.fn(),
  current: vi.fn(),
  seal: vi.fn(),
  configured: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
  verifyAuth: mocks.verifyAuth,
  getOAuthStateCookieOptions: async () => ({}),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/db/repositories/users", () => ({
  usersCollection: () => ({ findOne: mocks.findOne }),
}));
vi.mock("@/lib/auth/credentialSession", () => ({ credentialSessionIsCurrent: mocks.current }));
vi.mock("@/lib/auth/providerLinkContext", () => ({
  PROVIDER_LINK_CONTEXT_TTL_SECONDS: 600,
  providerLinkContextCookieName: () => "sealed-context",
  sealProviderLinkContext: mocks.seal,
}));
vi.mock("@/lib/auth/providerLinkAudit", () => ({ recordProviderLinkAudit: mocks.audit }));
vi.mock("@/lib/config/auth", () => ({ authConfig: { discordClientId: mocks.configured } }));
vi.mock("@/lib/discordRedirect", () => ({
  discordRedirectUri: () => "https://game.example/callback",
}));
vi.mock("@/lib/discord", () => ({ getDiscordOAuthUrl: () => "https://discord.example/authorize" }));
vi.mock("@/lib/utils/network", () => ({
  getBaseUrl: () => "https://game.example",
  getClientIp: async () => "192.0.2.1",
}));
vi.mock("@/lib/api/rateLimit", () => ({
  AUTH_LIMITS: { maxRequests: 10, windowMs: 60000 },
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
import { GET } from "./route";
const userId = "000000000000000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAuthUser.mockResolvedValue({ userId });
  mocks.verifyAuth.mockResolvedValue({ userId, iat: 100 });
  mocks.findOne.mockResolvedValue({ _id: new ObjectId(userId) });
  mocks.current.mockReturnValue(true);
  mocks.configured.mockReturnValue("synthetic-client");
  mocks.seal.mockReturnValue("sealed-value");
});
describe("Discord link start", () => {
  it("binds and logs a same-account attempt", async () => {
    const response = await GET(
      new Request(`https://game.example/api/auth/discord?expectedUserId=${userId}`)
    );
    expect(response.headers.get("location")).toBe("https://discord.example/authorize");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.seal).toHaveBeenCalledWith(
      expect.objectContaining({ userId, provider: "discord" })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "start",
        reason: "started",
        userId,
        state: expect.any(String),
      })
    );
  });
  it("rejects a switched account before issuing an OAuth context", async () => {
    const response = await GET(
      new Request("https://game.example/api/auth/discord?expectedUserId=000000000000000000000002")
    );
    expect(response.headers.get("location")).toContain("reason=session_expired");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "account_mismatch", userId })
    );
  });
  it.each(["/settings", "/create-character"])("returns a stale link to %s", async (returnUrl) => {
    const params = new URLSearchParams({ expectedUserId: "000000000000000000000002", returnUrl });
    const response = await GET(new Request(`https://game.example/api/auth/discord?${params}`));
    const result = new URL(response.headers.get("location")!);
    expect(result.searchParams.get("next")).toBe(returnUrl);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("logs an expired session without starting OAuth", async () => {
    mocks.current.mockReturnValue(false);
    const response = await GET(new Request("https://game.example/api/auth/discord"));
    expect(response.headers.get("location")).toBe("https://game.example/login");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "session_expired" })
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
