/** NPP sector disposal rechecks construction ownership and queues at write time. */
import type { Db, ObjectId } from "mongodb";
import { unprotectedConstructionPropertyFilter } from "@/lib/corporations/securedConstructionProperty";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

export async function deleteDivestedNppSectors(db: Db, sectorIds: readonly ObjectId[]) {
  if (sectorIds.length === 0) return;
  return corporateSectorsCollection<Document>(db).deleteMany({
    _id: { $in: sectorIds },
    // A player may have ordered a cash-funded build after the AI snapshot.
    "buildQueue.0": { $exists: false },
    constructionInProgressAnchor: { $in: [null, 0] },
    ...unprotectedConstructionPropertyFilter(),
  });
}
