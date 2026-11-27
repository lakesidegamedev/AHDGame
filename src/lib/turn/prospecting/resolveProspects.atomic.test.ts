import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { resolveProspects } from "./resolveProspects";
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn(async () => {}) }));
function fixture() {
  const f = createTransactionalMemoryDb();
  const company = new ObjectId(),
    survey = new ObjectId();
  f.memory.seed("prospectingSurveys", [
    {
      _id: survey,
      initiatorType: "corporation",
      corporationId: company,
      initiatorUserId: new ObjectId().toHexString(),
      countryId: "US",
      stateId: "TX",
      resource: "oil",
      completesTurn: 10,
      status: "active",
      rdScoreAtStart: 200,
      costAnchor: 500000,
    },
  ]);
  f.memory.seed("stateResourceCapacity", [
    { _id: new ObjectId(), stateId: "TX", countryId: "US", resources: { oil: 10000 } },
  ]);
  return f;
}
const winningRng = () => () => 0;
describe("prospecting completion conservation", () => {
  it.each(["prospectingSurveys", "stateResourceCapacity", "extractionContracts", "bankMoneyMoves"])(
    "recovers a landed %s failure",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(resolveProspects(fault.db, 10, new Date(), winningRng)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("prospectingSurveys").findOne({}))?.status).toBe("active");
      expect((await db.collection("stateResourceCapacity").findOne({}))?.resources.oil).toBe(10000);
      expect(await db.collection("extractionContracts").countDocuments({})).toBe(0);
      const first = await resolveProspects(db, 10, new Date(), winningRng);
      const retry = await resolveProspects(db, 10, new Date(), () => () => 0.99);
      expect(retry).toEqual(first);
      expect(first.totalCapacityAdded).toBeGreaterThan(0);
      expect((await db.collection("stateResourceCapacity").findOne({}))?.resources.oil).toBe(
        10000 + first.totalCapacityAdded
      );
      expect(await db.collection("extractionContracts").countDocuments({})).toBe(1);
    }
  );
  it("overlapping completion attempts grant capacity and finder rights once", async () => {
    const { db } = fixture();
    const replies = await Promise.all([
      resolveProspects(db, 10, new Date(), winningRng),
      resolveProspects(db, 10, new Date(), winningRng),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    expect(await db.collection("extractionContracts").countDocuments({})).toBe(1);
    expect((await db.collection("stateResourceCapacity").findOne({}))?.resources.oil).toBe(
      10000 + replies[0].totalCapacityAdded
    );
  });
});
