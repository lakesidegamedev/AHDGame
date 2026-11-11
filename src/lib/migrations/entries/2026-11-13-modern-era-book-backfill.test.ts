import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { migration } from "./2026-11-13-modern-era-book-backfill";
import { getCatalog } from "@/lib/politicalLegislation/catalog";

let db: MockDb;

describe("migration: modern-era-book-backfill", () => {
  beforeEach(() => {
    db = createMockDb();
    db.collection("gameState");
    db.collection("legislationTypes");
    db.collectionMocks.gameState.findOne.mockResolvedValue({
      _id: "current",
      preset: "2019-default",
      currentYear: 2027,
      startingYear: 2027,
      eraSystemEnabled: true,
    });
    db.collectionMocks.legislationTypes.find.mockReturnValue({ toArray: async () => [] });
    db.collectionMocks.legislationTypes.bulkWrite.mockResolvedValue({ upsertedCount: 0 });
    db.collection("states").find.mockImplementation((filter?: { countryId?: string }) => ({
      project: () => ({
        toArray: async () => (filter?.countryId === "CN" ? [{ _id: "DB" }, { _id: "HB" }] : []),
      }),
    }));
    db.collection("statePolicies").find.mockReturnValue({
      project: () => ({ toArray: async () => [] }),
    });
    db.collection("statePolicies").bulkWrite.mockResolvedValue({ upsertedCount: 0 });
  });

  it("is idempotent and registered under its id", () => {
    expect(migration.idempotent).toBe(true);
    expect(migration.id).toBe("2026-11-13-modern-era-book-backfill");
  });

  it("inserts the later-era law types for DE, JP and CN, insert-only", async () => {
    const result = await migration.execute(db as unknown as Db, { dryRun: false });
    const ops = db.collectionMocks.legislationTypes.bulkWrite.mock.calls[0]![0] as Array<{
      updateOne: { filter: { _id: string }; update: Record<string, unknown>; upsert: boolean };
    }>;
    const ids = new Set(ops.map((o) => o.updateOne.filter._id));
    for (const countryId of ["DE", "JP", "CN"] as const)
      for (const law of getCatalog(countryId).filter((l) => l.window))
        expect(ids.has(law.id)).toBe(true);
    for (const op of ops) expect(op.updateOne.update).toHaveProperty("$setOnInsert");
    expect(result.documentsInserted).toBeGreaterThan(0);
  });

  it("writes nothing on a dry run", async () => {
    await migration.execute(db as unknown as Db, { dryRun: true });
    expect(db.collectionMocks.legislationTypes.bulkWrite).not.toHaveBeenCalled();
    expect(db.collectionMocks.statePolicies.bulkWrite).not.toHaveBeenCalled();
  });
});
