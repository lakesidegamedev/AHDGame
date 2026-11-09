import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { jpLegislationTypes } from "@/lib/countries/jp/data/jpLegislationTypes";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { migration } from "./2026-11-09-jp-law-lean-effects";

function setup(docs: Array<{ _id: string; demographicEffects?: unknown }>) {
  const db = createMockDb() as unknown as MockDb;
  db.collection("legislationTypes").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue(docs),
  });
  return db;
}

describe("2026-11-09-jp-law-lean-effects", () => {
  const withEffects = jpLegislationTypes.filter((t) => t.demographicEffects);

  it("sets seeded effects on existing jp_ docs that lack them, and nothing else", async () => {
    const db = setup(withEffects.map((t) => ({ _id: t._id })));
    const result = await migration.execute(db as unknown as Db, { dryRun: false });
    const ops = db.collectionMocks.legislationTypes.bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: { _id: string }; update: Record<string, unknown>; upsert?: boolean };
    }>;
    expect(ops).toHaveLength(withEffects.length);
    expect(ops[0]!.updateOne.upsert).toBeUndefined();
    expect(Object.keys(ops[0]!.updateOne.update)).toEqual(["$set"]);
    expect(result.documentsUpdated).toBe(withEffects.length);
  });

  it("is a no-op when docs already match, and skips ids missing from the world", async () => {
    const db = setup(
      withEffects.slice(1).map((t) => ({ _id: t._id, demographicEffects: t.demographicEffects }))
    );
    const result = await migration.execute(db as unknown as Db, { dryRun: false });
    expect(db.collectionMocks.legislationTypes.bulkWrite).not.toHaveBeenCalled();
    expect(result.documentsUpdated).toBe(0);
  });

  it("writes nothing on a dry run", async () => {
    const db = setup(withEffects.map((t) => ({ _id: t._id })));
    await migration.execute(db as unknown as Db, { dryRun: true });
    expect(db.collectionMocks.legislationTypes.bulkWrite).not.toHaveBeenCalled();
  });
});
