import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { issueOrder } from "./issueOrder";
vi.mock("@/lib/news", () => ({ generateOrderNews: vi.fn(async () => {}) }));
const input = {
  countryId: "US",
  stateId: "TX",
  characterId: new ObjectId(),
  characterName: "Synthetic governor",
  legislationTypeId: "synthetic-law",
  effectDirection: 1,
} as const;
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, isProcessing: false, worldEpochId: "synthetic" },
  ]);
  f.memory.seed("governorOfficeState", [
    { _id: "TX", countryId: "US", stateId: "TX", gubernatorialActions: 1 },
  ]);
  f.memory.seed(
    "legislationTypes",
    ["synthetic-law", "second-law"].map((_id) => ({
      _id,
      policyOptions: [0, 1, 2, 3, 4].map((n) => ({ id: `option-${n}`, economic: n, social: n })),
    }))
  );
  f.memory.seed("statePolicies", [
    {
      _id: new ObjectId(),
      countryId: "US",
      stateId: "TX",
      legislationTypeId: "synthetic-law",
      policyOptionIndex: 2,
      scope: "state",
    },
  ]);
  return f;
}
describe("paid executive order publication", () => {
  it.each(["governorExecutiveOrders", "statePolicies", "governorOfficeState"])(
    "a landed %s failure restores policy and office actions",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(issueOrder(fault.db, input)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(
        1
      );
      expect((await db.collection("statePolicies").findOne({}))?.policyOptionIndex).toBe(2);
      expect(await db.collection("governorExecutiveOrders").countDocuments({})).toBe(0);
      expect((await issueOrder(db, input)).status).toBe(200);
      expect((await issueOrder(db, input)).status).toBeGreaterThanOrEqual(400);
      expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(
        0
      );
      expect(await db.collection("governorExecutiveOrders").countDocuments({})).toBe(1);
    }
  );
  it("two orders cannot spend one action; processing refuses publication", async () => {
    const { db, memory } = fixture();
    const replies = await Promise.all([
      issueOrder(db, input),
      issueOrder(db, { ...input, legislationTypeId: "second-law" }),
    ]);
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(0);
    memory.collection("gameState").docs[0].isProcessing = true;
    expect((await issueOrder(db, { ...input, adminOverride: true })).status).toBe(409);
  });
});
