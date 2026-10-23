import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { mechanicalLegislationTypes } from "@/lib/mechanicalLaws/legislation";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { migration } from "./2026-10-21-backfill-mechanical-law-types";

const TYPE_IDS = mechanicalLegislationTypes.map((type) => type._id);

function setup(existingIds: string[]) {
  const db = createMockDb() as unknown as MockDb;
  db.collection("legislationTypes").find.mockReturnValue({
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(existingIds.map((_id) => ({ _id }))),
  });
  return db;
}

describe("2026-10-21-backfill-mechanical-law-types", () => {
  it("inserts every missing mechanical law type with $setOnInsert", async () => {
    const db = setup([]);

    const result = await migration.execute(db as unknown as Db, { dryRun: false });

    const ops = db.collectionMocks.legislationTypes.bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: { _id: string }; update: { $setOnInsert: unknown }; upsert: boolean };
    }>;
    expect(ops.map((op) => op.updateOne.filter._id).sort()).toEqual([...TYPE_IDS].sort());
    expect(result.documentsInserted).toBe(TYPE_IDS.length);
    for (const op of ops) {
      expect(op.updateOne.upsert).toBe(true);
      expect(op.updateOne.update.$setOnInsert).toBeTruthy();
      // _id belongs to the filter, never to the update operator.
      expect(op.updateOne.update.$setOnInsert).not.toHaveProperty("_id");
    }
  });

  it("writes the real seeded documents, options and all", async () => {
    const db = setup([]);

    await migration.execute(db as unknown as Db, { dryRun: false });

    const ops = db.collectionMocks.legislationTypes.bulkWrite.mock.calls[0][0] as Array<{
      updateOne: {
        filter: { _id: string };
        update: { $setOnInsert: { policyOptions?: unknown[] } };
      };
    }>;
    const law = ops.find((op) => op.updateOne.filter._id === "fr_foreign_investment_law")!;
    expect(law.updateOne.update.$setOnInsert.policyOptions).toHaveLength(5);
  });

  it("inserts only the types a live world is missing", async () => {
    const db = setup(TYPE_IDS.slice(0, 2));

    const result = await migration.execute(db as unknown as Db, { dryRun: false });

    const ops = db.collectionMocks.legislationTypes.bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: { _id: string } };
    }>;
    expect(ops.map((op) => op.updateOne.filter._id).sort()).toEqual([...TYPE_IDS.slice(2)].sort());
    expect(result.documentsInserted).toBe(TYPE_IDS.length - 2);
  });

  it("is a no-op when the types are already present", async () => {
    const db = setup(TYPE_IDS);

    const result = await migration.execute(db as unknown as Db, { dryRun: false });

    expect(db.collectionMocks.legislationTypes.bulkWrite).not.toHaveBeenCalled();
    expect(result.documentsInserted).toBe(0);
  });

  it("writes nothing on a dry run", async () => {
    const db = setup([]);

    const result = await migration.execute(db as unknown as Db, { dryRun: true });

    expect(db.collectionMocks.legislationTypes.bulkWrite).not.toHaveBeenCalled();
    expect(result.documentsInserted).toBe(0);
    expect(result.notes?.join(" ")).toMatch(/dry run/i);
  });

  it("is declared idempotent", () => {
    expect(migration.idempotent).toBe(true);
  });
});
