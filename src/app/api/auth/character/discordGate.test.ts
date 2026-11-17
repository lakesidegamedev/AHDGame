import { beforeEach, describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: async () => "1991-default",
}));
vi.mock("@/lib/countryAccess", () => ({
  getCountryAccess: async () => ({ enabledForPlayers: true }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 1, effectiveNow: new Date(0) }),
}));
vi.mock("@/lib/singleplayer", () => ({ isSingleplayer: () => false }));
const data = {
  name: "Test Candidate",
  homeState: "SCO",
  countryId: "UK",
  party: "independent",
  policies: { economic: 0, social: 0 },
  demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
};
beforeEach(() => vi.clearAllMocks());
describe("character POST Discord requirement", () => {
  it("rejects a stale account before any character creation work", async () => {
    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: new ObjectId().toHexString() },
    } as never);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, expectedUserId: new ObjectId().toHexString() }),
      })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "ACCOUNT_CHANGED" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "blocks an unlinked account from creating a new character, admin=%s",
    async (isAdmin) => {
      const db = createMockDb();
      const id = new ObjectId();
      db.collection("states");
      db.collectionMocks.states.findOne.mockResolvedValue({ _id: "SCO", countryId: "UK" });
      db.collection("users");
      db.collectionMocks.users.findOne.mockResolvedValue({
        _id: id,
        isAdmin,
        activeCharacterCount: 0,
      });
      db.collection("gameConfig");
      db.collectionMocks.gameConfig.findOne.mockResolvedValue({
        _id: "default",
        discordLinkRequiredForCharacter: true,
      });
      const { getDb } = await import("@/lib/mongodb");
      vi.mocked(getDb).mockResolvedValue(db as never);
      const { requireBasicAuth } = await import("@/lib/api/requireAuth");
      vi.mocked(requireBasicAuth).mockResolvedValue({
        ok: true,
        user: { userId: id.toString() },
      } as never);
      const { POST } = await import("./route");
      const response = await POST(
        new Request("http://localhost/api/auth/character", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "DISCORD_LINK_REQUIRED" });
      expect(db.collection("characters").insertOne).not.toHaveBeenCalled();
    }
  );
});
