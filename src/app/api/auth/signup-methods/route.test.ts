import { beforeEach, describe, it, expect, vi } from "vitest";
import { createMockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/apple", () => ({ isAppleSignInConfigured: () => false }));
beforeEach(() => vi.clearAllMocks());
describe("public Discord requirement", () => {
  it.each([undefined, false, true])(
    "exposes required only for explicit true (%s)",
    async (required) => {
      const db = createMockDb();
      db.collection("gameConfig");
      db.collectionMocks.gameConfig.findOne.mockResolvedValue(
        required === undefined ? null : { discordLinkRequiredForCharacter: required }
      );
      const { getDb } = await import("@/lib/mongodb");
      vi.mocked(getDb).mockResolvedValue(db as never);
      const { GET } = await import("./route");
      const body = await (await GET()).json();
      expect(body.discordLinkRequired).toBe(required === true);
      expect(body.registration.open).toBe(true);
    }
  );
});
