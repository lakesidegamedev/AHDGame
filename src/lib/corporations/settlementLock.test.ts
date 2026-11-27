import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withCorporationSettlementLock } from "./settlementLock";
it("rolls back a lock whose claim was written without acknowledgement", async () => {
  const f = createTransactionalMemoryDb(),
    id = new ObjectId();
  f.memory.seed("corporations", [{ _id: id, liquidCapital: 100 }]);
  const col = f.memory.collection("corporations"),
    original = col.updateOne.bind(col);
  vi.spyOn(col, "updateOne").mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error("lost lock acknowledgement");
  });
  const run = (
    field: "bondSettlementInProgressAt" | "dissolutionInProgressAt" = "bondSettlementInProgressAt"
  ) =>
    withCorporationSettlementLock(f.db, id, field, new Date(0), async (db) => {
      await db.collection("corporations").updateOne({ _id: id }, { $inc: { liquidCapital: -10 } });
      await db.collection("receipts").insertOne({ corporationId: id });
      return true;
    });
  await expect(run()).rejects.toThrow("lost lock acknowledgement");
  expect(col.docs[0]).toEqual({ _id: id, liquidCapital: 100 });
  expect(await run()).toBe(true);
  expect(col.docs[0]).toEqual({ _id: id, liquidCapital: 90, updatedAt: new Date(0) });
  expect(f.memory.collection("receipts").docs).toHaveLength(1);
});
it("rolls back a settlement payout prefix and leaves its lock retryable", async () => {
  const f = createTransactionalMemoryDb(),
    id = new ObjectId();
  f.memory.seed("corporations", [{ _id: id, liquidCapital: 100 }]);
  await expect(
    withCorporationSettlementLock(f.db, id, "dissolutionInProgressAt", new Date(0), async (db) => {
      await db.collection("corporations").updateOne({ _id: id }, { $inc: { liquidCapital: -10 } });
      throw new Error("interrupted payout");
    })
  ).rejects.toThrow("interrupted payout");
  expect(f.memory.collection("corporations").docs[0]).toEqual({ _id: id, liquidCapital: 100 });
  expect(
    await withCorporationSettlementLock(
      f.db,
      id,
      "bondSettlementInProgressAt",
      new Date(0),
      async () => true
    )
  ).toBe(true);
});
it("does not steal an unresolved legacy settlement lock from either operation", async () => {
  const f = createTransactionalMemoryDb(),
    id = new ObjectId();
  f.memory.seed("corporations", [{ _id: id, dissolutionInProgressAt: new Date(0) }]);
  const work = vi.fn();
  expect(
    await withCorporationSettlementLock(f.db, id, "bondSettlementInProgressAt", new Date(), work)
  ).toBeNull();
  expect(work).not.toHaveBeenCalled();
});
