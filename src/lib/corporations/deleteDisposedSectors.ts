import type { Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { reserveSectorsForRestore } from "@/lib/corporations/securedConstructionProperty";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

type DisposedSector = Pick<
  CorporateSector,
  "_id" | "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
>;

export interface DeleteDisposedSectorsResult {
  sectorsProcessed: number;
  sectorsDeleted: number;
}

/**
 * Remove sector rows whose owner is leaving. Capacity that nobody picked up
 * simply stops: supply is only ever created by paid orders and seeds, so no
 * market-side bookkeeping is credited.
 *
 * Rows are marked first so a construction claim cannot attach between the
 * caller's read and the delete, and a retry re-reserves the same rows.
 */
export async function deleteDisposedSectors(
  db: Db,
  sectors: DisposedSector[]
): Promise<DeleteDisposedSectorsResult> {
  if (sectors.length === 0) return { sectorsProcessed: 0, sectorsDeleted: 0 };

  if (!(await reserveSectorsForRestore(db, sectors))) {
    throw new Error("deleteDisposedSectors: secured construction property cannot be disposed");
  }

  const sectorIds = sectors.map((sector) => sector._id);
  const deleteResult = await corporateSectorsCollection(db).deleteMany({
    _id: { $in: sectorIds },
    "constructionPropertyTransition.kind": "restore",
  });
  if (deleteResult.deletedCount !== sectorIds.length) {
    const remaining = await corporateSectorsCollection(db).countDocuments({
      _id: { $in: sectorIds },
    });
    if (remaining > 0) {
      throw new Error(
        `deleteDisposedSectors: expected to delete ${sectorIds.length} sectors, deleted ${deleteResult.deletedCount}, remaining ${remaining}`
      );
    }
  }
  return { sectorsProcessed: sectors.length, sectorsDeleted: sectorIds.length };
}
