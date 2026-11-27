import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { uploadFile } from "@/lib/r2";
import { runRetention } from "./retention";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/r2", () => ({ isR2Enabled: () => true, uploadFile: vi.fn(async () => "uploaded") }));
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100000 }]);
  f.memory.seed("financialTxLog", [
    { _id: new ObjectId(), turn: 1, amount: 100, currencyCode: "USD" },
  ]);
  Object.assign(f.db, { databaseName: "synthetic" });
  vi.mocked(getDb).mockResolvedValue(f.db);
  return f;
}
beforeEach(() => vi.clearAllMocks());
it("never deletes a late historical receipt outside the verified upload", async () => {
  const f = fixture(),
    late = new ObjectId();
  vi.mocked(uploadFile).mockImplementationOnce(async () => {
    await f.memory
      .collection("financialTxLog")
      .insertOne({ _id: late, turn: 1, amount: 200, currencyCode: "USD" });
    return "uploaded";
  });
  const result = await runRetention({ dryRun: false, collections: ["financialTxLog"] });
  expect(result.results[0]).toMatchObject({ archivedCount: 1, deletedCount: 1 });
  expect(f.memory.collection("financialTxLog").docs.map((row) => String(row._id))).toEqual([
    late.toString(),
  ]);
});
it("retains an archived identity whose contents changed while the upload was in flight", async () => {
  const f = fixture();
  vi.mocked(uploadFile).mockImplementationOnce(async () => {
    await f.memory.collection("financialTxLog").updateOne({}, { $set: { amount: 250 } });
    return "uploaded";
  });
  const result = await runRetention({ dryRun: false, collections: ["financialTxLog"] });
  expect(result.results[0]).toMatchObject({ archivedCount: 1, deletedCount: 0 });
  expect(f.memory.collection("financialTxLog").docs[0].amount).toBe(250);
});
it("leaves all source receipts online when archive publication fails", async () => {
  const f = fixture();
  vi.mocked(uploadFile).mockRejectedValueOnce(new Error("upload interrupted"));
  const result = await runRetention({ dryRun: false, collections: ["financialTxLog"] });
  expect(result.results[0].error).toMatch(/upload interrupted/);
  expect(f.memory.collection("financialTxLog").docs).toHaveLength(1);
});
