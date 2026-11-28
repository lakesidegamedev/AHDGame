import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { proposeCabinetBill } from "@/lib/cabinet/cabinetBills";
import { proposeInternationalOrganizationLeave } from "@/lib/internationalOrganizations/commands/proposeLeave";
vi.mock("@/lib/gameState", () => ({
  getGameState: async () => ({
    currentTurn: 5,
    currentYear: 2027,
    startingYear: 2027,
    preset: "2027-default",
  }),
}));
vi.mock("@/lib/countryState", () => ({
  getCountryState: async () => ({ governmentType: "constitutionalMonarchy" }),
}));
vi.mock("@/lib/resetVersions/rules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resetVersions/rules")>()),
  resetSystemVersionsForCountry: () => ({ legislation: "v2" }),
}));
vi.mock("@/lib/achievements/triggers", () => ({
  checkBillSponsoredAchievements: vi.fn().mockResolvedValue(undefined),
}));
describe("cabinet and organization withdrawal publication", () => {
  it.each(["cabinet", "withdrawal"] as const)(
    "%s retains the resource charge and bill as one outcome",
    async (kind) => {
      const f = createTransactionalMemoryDb();
      const character = {
        _id: new ObjectId(),
        userId: new ObjectId(),
        name: "Synthetic sponsor",
        countryId: "CA",
        party: "1",
        actions: 100,
        nationalInfluence: 1000,
      } as Character;
      f.memory.seed("characters", [{ ...character }]);
      f.memory.seed("gameState", [
        {
          _id: "current",
          currentTurn: 5,
          currentYear: 2027,
          startingYear: 2027,
          preset: "2027-default",
          resetWorldId: "private-proposal",
        },
      ]);
      f.memory.seed("governmentFormations", [
        { _id: "CA", pmCharacterId: character._id, status: "formed" },
      ]);
      f.memory.seed("cabinetMembers", [
        {
          _id: new ObjectId(),
          countryId: "CA",
          positionId: "finance",
          characterId: new ObjectId(),
        },
      ]);
      const run = async (db = f.db) => {
        if (kind === "cabinet") {
          const response = await proposeCabinetBill({
            db,
            countryId: "CA",
            character,
            isAdmin: false,
            input: {
              title: "Synthetic bill",
              summary: "Synthetic test",
              fullText: "Synthetic text",
              category: "custom",
            } as Parameters<typeof proposeCabinetBill>[0]["input"],
          });
          return { success: response.ok, status: response.status };
        }
        const result = await proposeInternationalOrganizationLeave({
          db,
          countryId: "CA",
          orgId: "NATO",
          organizationName: "Synthetic organization",
          actor: {
            characterId: character._id,
            characterName: character.name,
            party: "1",
            actions: 100,
          },
          input: { targetType: "organization", confirmElectionRisk: true },
        });
        return { success: result.ok };
      };
      const crash = withInjectedCrash(f.memory, {
        collection: "bills",
        op: "insertOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(run(crash.db)).rejects.toThrow();
      expect((await f.db.collection("characters").findOne({ _id: character._id }))?.actions).toBe(
        100
      );
      expect(await f.db.collection("bills").countDocuments({})).toBe(0);
      const results = await Promise.all([run(), run()]);
      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect(await f.db.collection("bills").countDocuments({})).toBe(1);
      expect(
        (await f.db.collection("characters").findOne({ _id: character._id }))?.actions
      ).toBeLessThan(100);
    }
  );
});
