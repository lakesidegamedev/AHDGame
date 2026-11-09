import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  MERGE_FILTER,
  MERGE_PIPELINE,
  RENAME_FILTER,
  migrateBucketApprovals,
} from "./2026-11-09-character-npp-bucket-approvals";
import {
  OPTION_MIGRATION_PIPELINE,
  migratePolicyOptionBucketApprovals,
} from "./2026-11-09-policy-option-bucket-approvals";

function fakeDb() {
  const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const countDocuments = vi.fn().mockResolvedValue(1);
  const db = { collection: () => ({ updateMany, countDocuments }) } as unknown as Db;
  return { db, updateMany, countDocuments };
}

describe("character and NPP bucket approval migration", () => {
  it("only renames documents that have no bucketApprovals yet", async () => {
    const { db, updateMany } = fakeDb();
    await migrateBucketApprovals(db, true);
    const renameCalls = updateMany.mock.calls.filter(([, update]) => "$rename" in update);
    expect(renameCalls.length).toBeGreaterThan(0);
    for (const [filter] of renameCalls) expect(filter).toEqual(RENAME_FILTER);
    expect(RENAME_FILTER.bucketApprovals).toEqual({ $exists: false });
  });

  it("merges into an existing bucketApprovals with the existing keys last", async () => {
    const { db, updateMany } = fakeDb();
    await migrateBucketApprovals(db, true);
    expect(updateMany).toHaveBeenCalledWith(MERGE_FILTER, MERGE_PIPELINE);
    const merged = MERGE_PIPELINE[0] as {
      $set: { bucketApprovals: { $mergeObjects: Array<{ $ifNull: [string, unknown] }> } };
    };
    const order = merged.$set.bucketApprovals.$mergeObjects.map((part) => part.$ifNull[0]);
    expect(order).toEqual(["$archetypeApprovals", "$bucketApprovals"]);
  });

  it("writes nothing on a dry run", async () => {
    const { db, updateMany } = fakeDb();
    await migrateBucketApprovals(db, false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("policy option bucket approval migration", () => {
  it("lets an option's existing bucketApprovals win over the legacy map", async () => {
    const { db, updateMany } = fakeDb();
    await migratePolicyOptionBucketApprovals(db, true);
    expect(updateMany).toHaveBeenCalledWith(expect.anything(), OPTION_MIGRATION_PIPELINE);
    const text = JSON.stringify(OPTION_MIGRATION_PIPELINE);
    expect(text).toContain(
      '"$mergeObjects":["$$legacy",{"$ifNull":["$$option.bucketApprovals",{}]}]'
    );
  });

  it("writes nothing on a dry run", async () => {
    const { db, updateMany } = fakeDb();
    await migratePolicyOptionBucketApprovals(db, false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
