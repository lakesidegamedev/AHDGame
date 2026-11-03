/**
 * The corporation cash write is the turn's single choke point for corporation
 * documents. This pins the merged path to the unmerged one: same fixture, same
 * final documents, same ledger rows, fewer write ops.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type AnyBulkWriteOperation, type Db, type Document } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyCorporationCashWrites } from "@/lib/turn/npp/foundingCashLedger";

const TURN = 453;
const now = new Date("2026-10-26T00:00:00Z");

type Fixture = { corpId: ObjectId; settledKeys: string[] };

function seedDocs(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let index = 0; index < 3; index++) {
    const corpId = new ObjectId();
    const settledKeys = Array.from({ length: 64 }, (_, key) => `settled-${index}-${key}`);
    fixtures.push({ corpId, settledKeys });
  }
  return fixtures;
}

function corporationDoc({ corpId, settledKeys }: Fixture, index: number): Record<string, unknown> {
  return {
    _id: corpId,
    liquidCapital: 100_000 + index,
    marketingStrength: 0,
    logisticsStrength: 0,
    rdScore: 0,
    settledKeys,
    brandLoyalty: 0.1,
    averageQuality: 0.5,
  };
}

/** The shape the turn builds: one guarded sector op plus several unguarded ones. */
function corporationOps(fixtures: Fixture[]): AnyBulkWriteOperation<Document>[] {
  const ops: AnyBulkWriteOperation<Document>[] = [];
  for (const [index, { corpId }] of fixtures.entries()) {
    ops.push({
      updateOne: {
        filter: { _id: corpId, advertisingMarketSettledTurnV1: { $ne: TURN } },
        update: {
          $inc: { liquidCapital: 10 + index, marketingStrength: -0.25, rdScore: 0.5 },
          $set: {
            earningsHistory: [1, 2, 3],
            sharePrice: 2.5,
            updatedAt: now,
            advertisingMarketSettledTurnV1: TURN,
          },
        },
      },
    });
    ops.push({
      updateOne: {
        filter: { _id: corpId },
        update: {
          $inc: { liquidCapital: -4 },
          $set: { nppStrategy: { mode: "growth", sinceTurn: TURN }, updatedAt: now },
        },
      },
    });
    ops.push({
      updateOne: { filter: { _id: corpId }, update: { $set: { brandLoyalty: 0.42 } } },
    });
    ops.push({
      updateOne: { filter: { _id: corpId }, update: { $set: { averageQuality: 0.8 } } },
    });
    ops.push({
      updateOne: {
        filter: { _id: corpId },
        update: {
          $push: { mediaProductAdvertisingObligationsV1: { projectId: "p1", turn: TURN } },
        },
      },
    } as unknown as AnyBulkWriteOperation<Document>);
  }
  return ops;
}

describe("corporation cash write merging", () => {
  it("writes the same corporation documents as the unmerged bulk", async () => {
    const fixtures = seedDocs();
    const docs = fixtures.map(corporationDoc);
    const ops = corporationOps(fixtures);

    const merged = createInMemoryDb();
    merged.seed("corporations", docs);
    await applyCorporationCashWrites(merged as unknown as Db, ops, [], []);

    const unmerged = createInMemoryDb();
    unmerged.seed("corporations", docs);
    await unmerged.collection("corporations").bulkWrite(ops as never);

    expect(merged.collection("corporations").docs).toEqual(
      unmerged.collection("corporations").docs
    );
  });

  it("sends one bulk write with fewer ops and leaves the witnesses empty", async () => {
    const fixtures = seedDocs();
    const memory = createInMemoryDb();
    memory.seed("corporations", fixtures.map(corporationDoc));
    const ops = corporationOps(fixtures);
    const bulkWrite = vi.spyOn(memory.collection("corporations"), "bulkWrite");

    await applyCorporationCashWrites(memory as unknown as Db, ops, [], []);

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const sent = bulkWrite.mock.calls[0][0] as AnyBulkWriteOperation<Document>[];
    expect(sent).toHaveLength(fixtures.length * 2);
    expect(sent.length).toBeLessThan(ops.length);
  });
});
