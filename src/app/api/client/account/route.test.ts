import { describe, expect, it, vi } from "vitest";

const requireBasicAuth = vi.fn();
const getAuthUserFromToken = vi.fn();
const findOne = vi.fn();
const getCookie = vi.fn();

const isFreeAccessOn = vi.fn(async () => false);

vi.mock("@/lib/freeAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/freeAccess")>()),
  isFreeAccessOn,
}));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth }));
vi.mock("@/lib/auth", () => ({ getAuthUserFromToken }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: getCookie })) }));
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(async () => ({ collection: () => ({ findOne }) })),
}));

describe("GET /api/client/account", () => {
  it("rejects unauthenticated WebView requests", async () => {
    const response = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    requireBasicAuth.mockResolvedValueOnce({ ok: false, response });
    const { GET } = await import("./route");

    const result = await GET();

    expect(result.status).toBe(401);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("returns only the desktop account summary, including singleplayer for a supporter", async () => {
    requireBasicAuth.mockResolvedValueOnce({
      ok: true,
      user: { userId: "507f1f77bcf86cd799439011" },
    });
    findOne.mockResolvedValueOnce({
      username: "Ada",
      displayName: "Ada Lovelace",
      patreonTier: "supporter",
      patreonExpiresAt: null,
      email: "private@example.com",
      discordId: "123",
      discordAvatar: "avatar-hash",
    });
    const { GET } = await import("./route");

    const result = await GET();
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      linked: true,
      displayName: "Ada Lovelace",
      avatarUrl: "https://cdn.discordapp.com/avatars/123/avatar-hash.png?size=128",
      supporter: true,
      singleplayer: { entitled: true },
    });
    expect(body).not.toHaveProperty("email");
  });

  it.each(["supporter", "supporter-plus", "supporter-plus-plus"])(
    "grants singleplayer to an active %s account without a manual entitlement field",
    async (patreonTier) => {
      requireBasicAuth.mockResolvedValueOnce({
        ok: true,
        user: { userId: "507f1f77bcf86cd799439011" },
      });
      findOne.mockResolvedValueOnce({
        username: "Ada",
        patreonTier,
        patreonExpiresAt: null,
        singleplayerEntitledAt: null,
      });
      const { GET } = await import("./route");

      const body = await (await GET()).json();

      expect(body.supporter).toBe(true);
      expect(body.singleplayer.entitled).toBe(true);
      expect(Date.parse(body.singleplayer.expiresAt)).toBeGreaterThan(Date.now());
    }
  );

  it.each(["supporter", "supporter-plus", "supporter-plus-plus"])(
    "denies singleplayer to a lapsed %s account with no purchase",
    async (patreonTier) => {
      requireBasicAuth.mockResolvedValueOnce({
        ok: true,
        user: { userId: "507f1f77bcf86cd799439011" },
      });
      findOne.mockResolvedValueOnce({
        username: "Ada",
        patreonTier,
        patreonExpiresAt: new Date(Date.now() - 60_000),
      });
      const { GET } = await import("./route");

      const body = await (await GET()).json();

      expect(body.supporter).toBe(false);
      expect(body.singleplayer).toEqual({ entitled: false, expiresAt: null });
    }
  );

  it("keeps singleplayer for a purchase holder after the supporter tier lapses", async () => {
    requireBasicAuth.mockResolvedValueOnce({
      ok: true,
      user: { userId: "507f1f77bcf86cd799439011" },
    });
    findOne.mockResolvedValueOnce({
      username: "Ada",
      patreonTier: "supporter",
      patreonExpiresAt: new Date(Date.now() - 60_000),
      singleplayerEntitledAt: new Date(),
    });
    const { GET } = await import("./route");

    const body = await (await GET()).json();

    expect(body.singleplayer.entitled).toBe(true);
  });

  it("grants singleplayer to moderators without a supporter or manual entitlement", async () => {
    requireBasicAuth.mockResolvedValueOnce({
      ok: true,
      user: { userId: "507f1f77bcf86cd799439011", isModerator: true },
    });
    findOne.mockResolvedValueOnce({ username: "Ada", displayName: "Ada" });
    const { GET } = await import("./route");

    const body = await (await GET()).json();

    expect(body.supporter).toBe(false);
    expect(body.singleplayer.entitled).toBe(true);
    expect(Date.parse(body.singleplayer.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("accepts the path-scoped compatibility cookie emitted by the link page", async () => {
    requireBasicAuth.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    getCookie.mockReturnValueOnce({ value: "bridge-jwt" });
    getAuthUserFromToken.mockResolvedValueOnce({
      userId: "507f1f77bcf86cd799439011",
      username: "Ada",
    });
    findOne.mockResolvedValueOnce({ username: "Ada", displayName: "Ada" });
    const { GET } = await import("./route");

    const result = await GET();

    expect(result.status).toBe(200);
    expect(getAuthUserFromToken).toHaveBeenCalledWith("bridge-jwt");
  });

  it("returns a bounded offline entitlement window only for entitled accounts", async () => {
    requireBasicAuth.mockResolvedValueOnce({
      ok: true,
      user: { userId: "507f1f77bcf86cd799439011" },
    });
    findOne.mockResolvedValueOnce({
      username: "Ada",
      displayName: "Ada",
      singleplayerEntitledAt: new Date(),
    });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.singleplayer.entitled).toBe(true);
    expect(Date.parse(body.singleplayer.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("grants singleplayer while a temporary client-access cutoff is still in the future", async () => {
    const remainingMs = 2 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() + remainingMs);
    requireBasicAuth.mockResolvedValueOnce({
      ok: true,
      user: { userId: "507f1f77bcf86cd799439011" },
    });
    findOne.mockResolvedValueOnce({
      username: "Ada",
      displayName: "Ada",
      clientAccessExpiresAt: cutoff,
    });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.singleplayer.entitled).toBe(true);
    const expiresAt = Date.parse(body.singleplayer.expiresAt);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(cutoff.getTime());
  });

  it("does not treat an expired temporary grant as entitled", async () => {
    requireBasicAuth.mockResolvedValueOnce({
      ok: true,
      user: { userId: "507f1f77bcf86cd799439011" },
    });
    findOne.mockResolvedValueOnce({
      username: "Ada",
      displayName: "Ada",
      clientAccessExpiresAt: new Date(Date.now() - 60_000),
    });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.singleplayer).toEqual({ entitled: false, expiresAt: null });
  });

  describe("free access", () => {
    const ownerAuth = { ok: true, user: { userId: "507f1f77bcf86cd799439011" } };

    it("is off by default and reports freeAccess false", async () => {
      requireBasicAuth.mockResolvedValueOnce(ownerAuth);
      findOne.mockResolvedValueOnce({ username: "Ada" });
      const { GET } = await import("./route");
      const body = await (await GET()).json();
      expect(body.freeAccess).toBe(false);
      expect(body.singleplayer).toEqual({ entitled: false, expiresAt: null });
    });

    it("entitles a linked account with no ownership, capped at one hour", async () => {
      isFreeAccessOn.mockResolvedValueOnce(true);
      requireBasicAuth.mockResolvedValueOnce(ownerAuth);
      findOne.mockResolvedValueOnce({ username: "Ada" });
      const { GET } = await import("./route");
      const body = await (await GET()).json();
      expect(body.freeAccess).toBe(true);
      expect(body.singleplayer.entitled).toBe(true);
      const ttl = Date.parse(body.singleplayer.expiresAt) - Date.now();
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
    });

    it("keeps the long expiry for a real owner while free access is on", async () => {
      isFreeAccessOn.mockResolvedValueOnce(true);
      requireBasicAuth.mockResolvedValueOnce(ownerAuth);
      findOne.mockResolvedValueOnce({ username: "Ada", singleplayerEntitledAt: new Date() });
      const { GET } = await import("./route");
      const body = await (await GET()).json();
      expect(body.freeAccess).toBe(true);
      const ttl = Date.parse(body.singleplayer.expiresAt) - Date.now();
      expect(ttl).toBeGreaterThan(24 * 60 * 60 * 1000);
    });
  });
});
