import type { Db, ObjectId } from "mongodb";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { NPP_ANCHOR_BALANCE_PATH } from "@/lib/corporations/payFundShareholders";

/**
 * Credits an NPP holder its squeeze-out proceeds. NPP shares are inside the
 * total the acquirer is debited for, so skipping this leaves that slice paid
 * to no one.
 */
export async function payNppSqueezeOut(
  db: Db,
  nppId: ObjectId,
  payoutAnchor: number,
  now: Date
): Promise<void> {
  await (
    await getNppsCollection(db)
  ).updateOne(
    { _id: nppId },
    {
      $inc: { [NPP_ANCHOR_BALANCE_PATH]: Math.round(payoutAnchor) },
      $set: { updatedAt: now },
    }
  );
}
