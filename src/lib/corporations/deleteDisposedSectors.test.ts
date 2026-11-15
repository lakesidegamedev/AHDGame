import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { CorporateSector } from "@/lib/db/types";
import { deleteDisposedSectors } from "./deleteDisposedSectors";

const reserve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/corporations/securedConstructionProperty", () => ({
  reserveSectorsForRestore: reserve,
}));

function sector(): CorporateSector {
  return {
    _id: new ObjectId(),
    corporationId: new ObjectId(),
    countryId: "US",
    stateId: "CA",
    sectorType: "technology",
  } as CorporateSector;
}

describe("deleteDisposedSectors", () => {
  let db: MockDb;
  beforeEach(() => {
    db = createMockDb();
    reserve.mockReset();
    reserve.mockResolvedValue(true);
  });

  it("does nothing for an empty list", async () => {
    const result = await deleteDisposedSectors(db as unknown as Db, []);
    expect(result).toEqual({ sectorsProcessed: 0, sectorsDeleted: 0 });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("reserves then deletes the rows and never touches a market pool", async () => {
    const rows = [sector(), sector()];
    db.collection("corporateSectors");
    db.collectionMocks.corporateSectors.deleteMany.mockResolvedValue({ deletedCount: 2 });
    const result = await deleteDisposedSectors(db as unknown as Db, rows);
    expect(result).toEqual({ sectorsProcessed: 2, sectorsDeleted: 2 });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(db.collectionMocks.corporateSectors.deleteMany).toHaveBeenCalledWith({
      _id: { $in: rows.map((r) => r._id) },
      "constructionPropertyTransition.kind": "restore",
    });
    expect(db.collectionMocks.unownedSectors).toBeUndefined();
  });

  it("refuses when secured construction property cannot be disposed", async () => {
    reserve.mockResolvedValue(false);
    await expect(deleteDisposedSectors(db as unknown as Db, [sector()])).rejects.toThrow(
      /secured construction property/
    );
  });

  it("fails loudly when rows remain after the delete", async () => {
    db.collection("corporateSectors");
    db.collectionMocks.corporateSectors.deleteMany.mockResolvedValue({ deletedCount: 0 });
    db.collectionMocks.corporateSectors.countDocuments.mockResolvedValue(1);
    await expect(deleteDisposedSectors(db as unknown as Db, [sector()])).rejects.toThrow(
      /remaining 1/
    );
  });
});
