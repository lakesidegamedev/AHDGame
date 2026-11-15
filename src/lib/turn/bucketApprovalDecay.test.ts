import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/mongodb";
import { processBucketApprovalDecay } from "./bucketApprovalDecay";

describe("approval decay turn persistence", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });
  it("persists full precision for characters and NPPs across countries in two batched writes", async () => {
    const rows = ["US", "UK", "JP", "IE", "SCO", "WAL"].map((countryId) => ({
      _id: new ObjectId(),
      countryId,
      bucketApprovals: { small: 0.18, negative: -0.8, threshold: 0.01 },
    }));
    for (const name of ["characters", "npps"]) {
      db.collection(name).find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(rows) });
      db.collection(name).bulkWrite.mockResolvedValue({ modifiedCount: rows.length });
    }
    expect(await processBucketApprovalDecay()).toEqual({
      charactersProcessed: 6,
      nppsProcessed: 6,
    });
    for (const name of ["characters", "npps"]) {
      expect(db.collectionMocks[name]!.find).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks[name]!.find.mock.calls[0]![1]).toEqual({
        projection: { bucketApprovals: 1 },
      });
      expect(db.collectionMocks[name]!.bulkWrite).toHaveBeenCalledTimes(1);
      const writes = db.collectionMocks[name]!.bulkWrite.mock.calls[0]![0];
      expect(writes).toHaveLength(6);
      for (const write of writes) {
        const saved = write.updateOne.update.$set.bucketApprovals;
        expect(saved.small).toBeCloseTo(0.1791, 12);
        expect(saved.small).not.toBe(0.18);
        expect(saved.negative).toBeCloseTo(-0.796, 12);
        expect(saved.threshold).toBe(0);
      }
    }
  });
  it("preserves a concurrent credit instead of overwriting it with a stale decay snapshot", async () => {
    const id = new ObjectId(),
      snapshot = { small: 0.18 };
    let live = { small: 0.28 };
    db.collection("characters").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: id, bucketApprovals: snapshot }]),
    });
    db.collection("characters").bulkWrite.mockImplementation(
      async (
        operations: Array<{
          updateOne: {
            filter: { bucketApprovals: { small: number } };
            update: { $set: { bucketApprovals: { small: number } } };
          };
        }>
      ) => {
        const op = operations[0]!.updateOne;
        if (op.filter.bucketApprovals.small !== live.small) return { modifiedCount: 0 };
        live = op.update.$set.bucketApprovals;
        return { modifiedCount: 1 };
      }
    );
    expect(await processBucketApprovalDecay()).toEqual({
      charactersProcessed: 0,
      nppsProcessed: 0,
    });
    expect(live.small).toBe(0.28);
  });

  it("does not write empty or already-zero balances", async () => {
    const rows = [{ _id: new ObjectId(), bucketApprovals: { zero: 0 } }];
    for (const name of ["characters", "npps"])
      db.collection(name).find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(rows) });
    expect(await processBucketApprovalDecay()).toEqual({
      charactersProcessed: 0,
      nppsProcessed: 0,
    });
    expect(db.collectionMocks.characters!.bulkWrite).not.toHaveBeenCalled();
    expect(db.collectionMocks.npps!.bulkWrite).not.toHaveBeenCalled();
  });
});
