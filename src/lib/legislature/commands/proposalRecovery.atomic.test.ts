import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { proposeNationalBill } from "./proposeNationalBill";
import { proposeStateBill } from "./proposeStateBill";
vi.mock("@/lib/gameState", () => ({
  getGameState: async () => ({ currentTurn: 5, preset: "1953-default", currentYear: 1953 }),
}));
vi.mock("@/lib/countryState", () => ({
  getCountryState: async () => ({ governmentType: "onePartyState" }),
}));
vi.mock("@/lib/countryAccess", () => ({ getEnabledCountryIds: async () => ["CN", "US"] }));
vi.mock("@/lib/achievements/triggers", () => ({
  checkBillSponsoredAchievements: vi.fn().mockResolvedValue(undefined),
}));
describe("proposal resource and publication recovery", () => {
  it.each(["national", "regional"] as const)(
    "%s bill: rolls back a landed publication and permits one overlapping proposal",
    async (kind) => {
      const f = createTransactionalMemoryDb(),
        userId = new ObjectId(),
        characterId = new ObjectId();
      const character = {
        _id: characterId,
        userId,
        name: "Synthetic delegate",
        countryId: "CN",
        party: "1",
        actions: 100,
        nationalInfluence: 1000,
      };
      const auth = { userId: String(userId), isAdmin: false, character };
      f.memory.seed("gameState", [
        {
          _id: "current",
          currentTurn: 5,
          startingYear: 1953,
          currentYear: 1953,
          preset: "1953-default",
        },
      ]);
      f.memory.seed("characters", [character]);
      f.memory.seed("politicalParties", [
        { _id: new ObjectId(), countryId: "CN", sequentialId: 1 },
      ]);
      f.memory.seed("electedOfficials", [
        {
          _id: new ObjectId(),
          characterId,
          countryId: "CN",
          state: "XB",
          officeType: kind === "national" ? "npcDelegate" : "peoplesCongress",
        },
      ]);
      const collection = kind === "national" ? "bills" : "stateBills";
      const run = (db = f.db) =>
        kind === "national"
          ? proposeNationalBill(
              db,
              "CN",
              auth as unknown as Parameters<typeof proposeNationalBill>[2],
              {
                title: "Synthetic bill",
                summary: "Synthetic test",
                category: "general",
                chamber: "npc",
                provisions: [],
              }
            )
          : proposeStateBill(db, "CN", "XB", auth as Parameters<typeof proposeStateBill>[3], {
              title: "Synthetic bill",
              summary: "Synthetic test",
              category: "general",
              provisions: [],
            });
      const crash = withInjectedCrash(f.memory, {
        collection,
        op: "insertOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(run(crash.db)).rejects.toThrow();
      expect((await f.db.collection("characters").findOne({ _id: characterId }))?.actions).toBe(
        100
      );
      expect(await f.db.collection(collection).countDocuments({})).toBe(0);
      const results = await Promise.all([run(), run()]);
      expect(results.filter((r) => r.status >= 200 && r.status < 300)).toHaveLength(1);
      expect(await f.db.collection(collection).countDocuments({})).toBe(1);
      expect(
        (await f.db.collection("characters").findOne({ _id: characterId }))?.actions
      ).toBeLessThan(100);
    }
  );
});
