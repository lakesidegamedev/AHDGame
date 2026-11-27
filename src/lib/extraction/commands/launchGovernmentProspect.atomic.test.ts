import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { launchGovernmentProspect } from "./launchGovernmentProspect";
import { getDb } from "@/lib/mongodb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const args = { countryId: "US", stateId: "TX", resource: "oil", level: "state" } as const;
const actor = { characterId: new ObjectId(), userId: new ObjectId().toHexString(), isAdmin: true };
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      currentYear: 2027,
      startingYear: 2027,
      isProcessing: false,
      worldEpochId: "synthetic",
      preset: "2027-default",
    },
  ]);
  f.memory.seed("stateResourceCapacity", [
    { _id: new ObjectId(), countryId: "US", stateId: "TX", resources: { oil: 10000 } },
  ]);
  f.memory.seed("governorOfficeState", [
    { _id: "TX", countryId: "US", stateId: "TX", gubernatorialActions: 3 },
  ]);
  f.memory.seed("stateBudgets", [
    {
      _id: "TX",
      countryId: "US",
      spending: { resourceProspecting: 0, total: 0 },
      treasuryCashLocal: 1000,
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  return f;
}
describe("regional government prospect resource settlement", () => {
  it.each(["governorOfficeState", "stateBudgets", "prospectingSurveys"])(
    "rolls back a landed %s failure without losing AP or money",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(
        launchGovernmentProspect(fault.db, args, actor, 100, new Date())
      ).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(
        3
      );
      expect((await db.collection("stateBudgets").findOne({}))?.spending.total).toBe(0);
      expect(await db.collection("prospectingSurveys").countDocuments({})).toBe(0);
      const first = await launchGovernmentProspect(db, args, actor, 100, new Date());
      expect(first.ok).toBe(true);
      expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(
        2
      );
      expect((await db.collection("stateBudgets").findOne({}))?.treasuryCashLocal).toBe(1000);
      const duplicate = await launchGovernmentProspect(db, args, actor, 100, new Date());
      expect(duplicate.ok).toBe(false);
      expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(
        2
      );
    }
  );
  it("parallel launches publish one survey; a missing budget cannot consume AP", async () => {
    const { db } = fixture();
    const replies = await Promise.all([
      launchGovernmentProspect(db, args, actor, 100, new Date()),
      launchGovernmentProspect(db, args, actor, 100, new Date()),
    ]);
    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.collection("prospectingSurveys").countDocuments({})).toBe(1);
    await db.collection("prospectingSurveys").deleteMany({});
    await db.collection("stateBudgets").deleteMany({});
    const declined = await launchGovernmentProspect(db, args, actor, 100, new Date());
    expect(declined.ok).toBe(false);
    expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(2);
  });
});
