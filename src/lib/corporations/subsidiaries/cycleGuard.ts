import type { Db, ObjectId } from "mongodb";
import { wouldCreateOwnershipCycle } from "./helpers";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

/** Refusal message shown when a corporate purchase would close an ownership loop. */
export const OWNERSHIP_CYCLE_ERROR =
  "That corporation already controls yours, directly or through a chain of subsidiaries. Buying its shares would create a circular ownership loop.";

/**
 * Would `buyer` buying into `target` close an ownership loop (A controls B
 * controls A)?
 *
 * Checked at the point of purchase, not at `formalizeSubsidiary`, so the loop
 * never forms in the share graph. Reads the corp graph once; call only on the
 * corporate-buyer path.
 */
export async function corpPurchaseWouldCycle(
  db: Db,
  buyerCorpId: ObjectId,
  targetCorpId: ObjectId
): Promise<boolean> {
  if (buyerCorpId.equals(targetCorpId)) return true;

  const allCorps = await corporationsCollection(db)
    .find({}, { projection: { _id: 1, shareholders: 1, totalShares: 1, superShareMultiplier: 1 } })
    .toArray();

  return wouldCreateOwnershipCycle({ _id: buyerCorpId }, { _id: targetCorpId }, allCorps);
}
