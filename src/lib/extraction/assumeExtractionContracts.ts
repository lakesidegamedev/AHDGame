import type { Db, ObjectId } from "mongodb";
import { getExtractionContractsCollection } from "@/lib/db/collections/extractionContracts";

/**
 * When a contractor is absorbed (agreed acquisition, hostile takeover) its
 * extraction contracts follow its sectors to the acquirer instead of being
 * closed as orphans. Re-pointing the holder keeps the term, royalty and share
 * as they were; revoked, declined and expired rows stay with the dead id.
 * Safe to repeat: a second run finds nothing left on the old holder.
 */
export async function assumeExtractionContracts(
  db: Db,
  args: { fromId: ObjectId; toId: ObjectId; now: Date }
): Promise<number> {
  const result = await (
    await getExtractionContractsCollection(db)
  ).updateMany(
    { corporationId: args.fromId, revokedTurn: { $exists: false } },
    { $set: { corporationId: args.toId, updatedAt: args.now } }
  );
  return result.modifiedCount;
}
