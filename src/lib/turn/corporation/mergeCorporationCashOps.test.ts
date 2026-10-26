import { describe, expect, it } from "vitest";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { mergeCorporationCashOps } from "./mergeCorporationCashOps";

type Op = AnyBulkWriteOperation<Document>;

const updatedAt = new Date("2026-10-26T00:00:00Z");

/** Apply ops one at a time, the way an unmerged bulkWrite applies them. */
async function applySequentially(ops: Op[], seed: Record<string, unknown>[]) {
  const db = createInMemoryDb();
  db.seed("corporations", seed);
  const collection = db.collection("corporations");
  for (const op of ops) {
    if (!("updateOne" in op)) throw new Error("test expects updateOne ops only");
    await collection.updateOne(op.updateOne.filter, op.updateOne.update);
  }
  return db.collection("corporations").docs;
}

async function applyMerged(ops: Op[], seed: Record<string, unknown>[]) {
  const db = createInMemoryDb();
  db.seed("corporations", seed);
  await db.collection("corporations").bulkWrite(mergeCorporationCashOps(ops));
  return db.collection("corporations").docs;
}

const corpId = new ObjectId("6acfed51c94e7a1e6770b781");

const sectorOp = (): Op => ({
  updateOne: {
    filter: { _id: corpId, advertisingMarketSettledTurnV1: { $ne: 5 } },
    update: {
      $inc: { liquidCapital: 25, marketingStrength: -0.5 },
      $set: { earningsHistory: [10, 20], updatedAt, advertisingMarketSettledTurnV1: 5 },
    },
  },
});

const nppOp = (): Op => ({
  updateOne: {
    filter: { _id: corpId },
    update: {
      $inc: { liquidCapital: -7 },
      $set: { nppStrategy: "growth", updatedAt },
    },
  },
});

const brandOp = (): Op => ({
  updateOne: {
    filter: { _id: corpId },
    update: { $set: { brandLoyalty: 0.42 } },
  },
});

const qualityOp = (): Op => ({
  updateOne: {
    filter: { _id: corpId },
    update: { $set: { averageQuality: 0.8 } },
  },
});

const pushOp = (): Op => ({
  updateOne: {
    filter: { _id: corpId },
    update: { $push: { mediaProductAdvertisingObligationsV1: { projectId: "p1", turn: 5 } } },
  },
});

describe("mergeCorporationCashOps", () => {
  it("produces the same document as applying the unguarded ops one at a time", async () => {
    const seed = [
      { _id: corpId, liquidCapital: 100, marketingStrength: 0, brandLoyalty: 0.1 },
      { _id: new ObjectId(), liquidCapital: 50 },
    ];
    const ops = [sectorOp(), nppOp(), brandOp(), qualityOp(), pushOp()];

    expect(await applyMerged(ops, seed)).toEqual(await applySequentially(ops, seed));
  });

  it("collapses the per-corporation unguarded ops and keeps the guarded one", () => {
    const merged = mergeCorporationCashOps([sectorOp(), nppOp(), brandOp(), qualityOp(), pushOp()]);

    expect(merged).toHaveLength(2);
    const guarded = merged.find(
      (op) => "updateOne" in op && op.updateOne.filter.advertisingMarketSettledTurnV1 !== undefined
    );
    expect(guarded).toBeDefined();
    const combined = merged.find(
      (op) => "updateOne" in op && op.updateOne.filter.advertisingMarketSettledTurnV1 === undefined
    );
    expect(combined && "updateOne" in combined && combined.updateOne.update).toMatchObject({
      $inc: { liquidCapital: -7 },
      $set: { nppStrategy: "growth", brandLoyalty: 0.42, averageQuality: 0.8, updatedAt },
      $push: { mediaProductAdvertisingObligationsV1: { projectId: "p1", turn: 5 } },
    });
  });

  it("keeps $inc accumulating and the later $set winning, as the ordered bulk would", () => {
    const ops: Op[] = [
      {
        updateOne: {
          filter: { _id: corpId },
          update: { $inc: { liquidCapital: 10 }, $set: { sharePrice: 2 } },
        },
      },
      {
        updateOne: {
          filter: { _id: corpId },
          update: { $inc: { liquidCapital: 5 }, $set: { sharePrice: 3 } },
        },
      },
    ];
    const [merged] = mergeCorporationCashOps(ops);
    expect(merged && "updateOne" in merged && merged.updateOne.update).toEqual({
      $set: { sharePrice: 3 },
      $inc: { liquidCapital: 15 },
    });
  });

  it("keeps pushed values in order", () => {
    const ops: Op[] = [
      { updateOne: { filter: { _id: corpId }, update: { $push: { rows: { n: 1 } } } } },
      { updateOne: { filter: { _id: corpId }, update: { $push: { rows: { n: 2 } } } } },
    ];
    const [merged] = mergeCorporationCashOps(ops);
    expect(merged && "updateOne" in merged && merged.updateOne.update).toEqual({
      $push: { rows: { $each: [{ n: 1 }, { n: 2 }] } },
    });
  });

  it("leaves a document unmerged when a guarded op writes the same field differently", () => {
    const ops: Op[] = [
      sectorOp(),
      {
        updateOne: {
          filter: { _id: corpId, pendingMoneyMoveReceipt: { $exists: false } },
          update: { $set: { liquidCapital: 999 } },
        },
      },
      { updateOne: { filter: { _id: corpId }, update: { $inc: { liquidCapital: -7 } } } },
    ];
    expect(mergeCorporationCashOps(ops)).toHaveLength(3);
  });

  it("does not merge replacement updates or pipelined updates", () => {
    const ops: Op[] = [
      { replaceOne: { filter: { _id: corpId }, replacement: { liquidCapital: 1 } } },
      { updateOne: { filter: { _id: corpId }, update: [{ $set: { liquidCapital: 2 } }] } },
      { updateOne: { filter: { _id: corpId }, update: { $set: { brandLoyalty: 0.5 } } } },
    ];
    expect(mergeCorporationCashOps(ops)).toHaveLength(3);
  });
});

describe("mergeCorporationCashOps conflict fallbacks", () => {
  const id = "corp-1";
  const op = (update: Record<string, unknown>) => ({ updateOne: { filter: { _id: id }, update } });

  it("keeps separate ops when a field is $set and then $inc'd", () => {
    const ops = [op({ $set: { liquidCapital: 5 } }), op({ $inc: { liquidCapital: 3 } })];
    expect(mergeCorporationCashOps(ops)).toEqual(ops);
  });

  it("keeps separate ops when paths overlap", () => {
    const ops = [op({ $set: { sectors: [] } }), op({ $inc: { "sectors.0.cash": 1 } })];
    expect(mergeCorporationCashOps(ops)).toEqual(ops);
  });

  it("keeps separate pushes that carry $slice", () => {
    const ops = [
      op({ $push: { history: { $each: [1], $slice: -5 } } }),
      op({ $push: { history: { $each: [2], $slice: -5 } } }),
    ];
    expect(mergeCorporationCashOps(ops)).toEqual(ops);
  });

  it("still merges disjoint fields", () => {
    const ops = [op({ $set: { a: 1 } }), op({ $inc: { b: 2 } })];
    expect(mergeCorporationCashOps(ops)).toEqual([op({ $set: { a: 1 }, $inc: { b: 2 } })]);
  });
});
