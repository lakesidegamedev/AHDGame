import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createPlannedIndexes, type IndexPlan } from "./indexPlans";

const plans: IndexPlan[] = ["first", "second", "third"].map((name) => ({
  collection: name,
  keys: { countryId: 1 },
  options: { name: name + "_by_country", unique: true, sparse: true, background: true },
}));
const mockDb = (createIndex = vi.fn()) => {
  const collection = vi.fn(() => ({ createIndex }));
  return { db: { collection } as unknown as Db, collection, createIndex };
};

describe("createPlannedIndexes", () => {
  it.each([true, false])("returns zero counts for an empty plan (dryRun=%s)", async (dryRun) => {
    const { db, collection } = mockDb();
    expect(await createPlannedIndexes(db, dryRun, [])).toEqual({
      documentsScanned: 0,
      documentsUpdated: 0,
      notes: [],
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("reports each dry-run plan without accessing the database", async () => {
    const { db, collection } = mockDb();
    expect(await createPlannedIndexes(db, true, plans)).toEqual({
      documentsScanned: 3,
      documentsUpdated: 0,
      notes: plans.map((p) => "would create " + p.collection + "." + p.options.name),
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("awaits each index in order and forwards the exact keys/options objects", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const createIndex = vi.fn().mockReturnValueOnce(pending).mockResolvedValue("verified");
    const { db, collection } = mockDb(createIndex);
    const result = createPlannedIndexes(db, false, plans);
    expect(collection.mock.calls).toEqual([["first"]]);
    expect(createIndex).toHaveBeenCalledOnce();
    release();
    expect(await result).toEqual({
      documentsScanned: 3,
      documentsUpdated: 3,
      notes: plans.map((p) => "created/verified " + p.collection + "." + p.options.name),
    });
    expect(collection.mock.calls).toEqual(plans.map((p) => [p.collection]));
    for (const [i, plan] of plans.entries()) {
      expect(createIndex.mock.calls[i][0]).toBe(plan.keys);
      expect(createIndex.mock.calls[i][1]).toBe(plan.options);
    }
  });

  it("propagates the original failure and does not start later index builds", async () => {
    const error = new Error("index build failed");
    const { db, collection, createIndex } = mockDb(
      vi.fn().mockResolvedValueOnce("verified").mockRejectedValueOnce(error)
    );
    await expect(createPlannedIndexes(db, false, plans)).rejects.toBe(error);
    expect(collection.mock.calls).toEqual([["first"], ["second"]]);
    expect(createIndex).toHaveBeenCalledTimes(2);
  });
});
