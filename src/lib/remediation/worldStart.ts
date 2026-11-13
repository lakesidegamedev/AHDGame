import { ObjectId, type Db } from "mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * When the current world began: the creation time of its epoch id. A restitution
 * pinned to a past world's event must not credit a document this world created.
 */
export async function currentWorldStart(db: Db): Promise<Date | null> {
  const state = await gameStateCollection<{ worldEpochId?: string }>(db).findOne(
    { _id: "current" },
    { projection: { worldEpochId: 1 } }
  );
  const epoch = state?.worldEpochId;
  return epoch && ObjectId.isValid(epoch) ? new ObjectId(epoch).getTimestamp() : null;
}

/** True when the document was created by the current world. */
export function createdByCurrentWorld(
  doc: { createdAt?: unknown } | undefined,
  worldStart: Date | null
): boolean {
  return (
    worldStart !== null &&
    doc?.createdAt instanceof Date &&
    doc.createdAt.getTime() >= worldStart.getTime()
  );
}
