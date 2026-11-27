import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { submitCrisisAidPledge } from "./aidPledge";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/budget/treasurySpend", () => ({
  spendFromTreasury: async (db: Db, countryId: string, amount: number) => {
    await db
      .collection("federalBudget")
      .updateOne({ countryId }, { $inc: { treasuryCashLocal: -amount } });
    return { fromSurplus: amount, addedToDebt: 0 };
  },
}));
vi.mock("@/lib/crises/applyEffects", () => ({
  applyCrisisEffects: async (db: Db) => {
    await db.collection("states").updateOne({}, { $inc: { approval: 1 } });
  },
}));
vi.mock("@/lib/crises/interactionEngine", () => ({
  applyEffectsForCrisis: async (db: Db, _id: ObjectId) => {
    await db.collection("crises").updateOne({ _id }, { $inc: { repair: 1 } });
  },
}));
vi.mock("@/lib/legislature/commands/proposeCrisisAidBill", () => ({
  proposeCrisisAidBill: async (db: Db, input: { billId: ObjectId }) => {
    await db.collection("bills").insertOne({ _id: input.billId });
  },
}));
function world() {
  const f = createTransactionalMemoryDb(),
    crisisId = new ObjectId(),
    interactionId = new ObjectId();
  f.memory.seed("crisisInteractions", [
    {
      _id: interactionId,
      crisisId,
      currentNodeId: "aid",
      resolvedAt: null,
      decisionTree: [{ nodeId: "aid", type: "aid" }],
      resolutionPath: [],
    },
  ]);
  f.memory.seed("crises", [{ _id: crisisId, name: "Flood", repair: 0 }]);
  f.memory.seed("states", [{ _id: "TX", approval: 50 }]);
  f.memory.seed("federalBudget", [
    { _id: "federal", countryId: "US", gdp: 100000, treasuryCashLocal: 1000 },
  ]);
  const input = {
    interactionId,
    nodeId: "aid",
    pctGdp: 0.001,
    characterId: new ObjectId(),
    characterName: "Leader",
    senderCountryId: "US" as const,
    characterRoles: ["headOfState"],
  };
  return { ...f, input };
}
describe("atomic crisis aid pledges", () => {
  it.each(["federalBudget", "crises", "states", "bills", "crisisInteractions"])(
    "rolls back a landed %s write and permits one retry",
    async (collection) => {
      const f = world(),
        fault = withInjectedCrash(f.memory, {
          collection,
          op: collection === "bills" ? "insertOne" : "updateOne",
          onCall: 1,
          afterWrite: true,
        });
      await expect(submitCrisisAidPledge(fault.db, f.input)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("crisisAidCommitments").docs).toHaveLength(0);
      expect(f.memory.collection("bills").docs).toHaveLength(0);
      expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBe(1000);
      expect(f.memory.collection("crises").docs[0].repair).toBe(0);
      expect(f.memory.collection("states").docs[0].approval).toBe(50);
      const retried = await Promise.allSettled([
        submitCrisisAidPledge(f.db, f.input),
        submitCrisisAidPledge(f.db, f.input),
      ]);
      expect(retried.filter((row) => row.status === "fulfilled")).toHaveLength(1);
      expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBe(900);
      expect(f.memory.collection("bills").docs).toHaveLength(1);
      expect(f.memory.collection("crises").docs[0].repair).toBe(1);
      expect(f.memory.collection("states").docs[0].approval).toBe(51);
    }
  );
});
