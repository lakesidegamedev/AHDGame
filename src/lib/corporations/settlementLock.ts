import type { Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export type CorporationSettlementLock = "bondSettlementInProgressAt" | "dissolutionInProgressAt";

export interface CorporationSettlementLockOptions {
  /**
   * Let a claim take over a lock stamped longer ago than this. Leave unset for
   * any run that moves money without its own resume record: such a lock stays
   * held until an operator clears it, because a second run could pay twice.
   */
  staleAfterMs?: number;
}

/** Releases only the claim stamped with `claimedAt`, never a newer holder's. */
async function clearLock(
  db: Db,
  corporationId: Corporation["_id"],
  field: CorporationSettlementLock,
  claimedAt: Date
): Promise<void> {
  await corporationsCollection(db).updateOne(
    { _id: corporationId, [field]: claimedAt },
    { $unset: { [field]: "" } }
  );
}

async function claimCorporationSettlementLock(
  db: Db,
  corporationId: ObjectId,
  field: CorporationSettlementLock,
  now: Date,
  staleAfterMs: number | undefined
): Promise<boolean> {
  const free = { [field]: { $exists: false } };
  const filter =
    staleAfterMs === undefined
      ? { _id: corporationId, ...free }
      : {
          _id: corporationId,
          $or: [free, { [field]: { $lt: new Date(now.getTime() - staleAfterMs) } }],
        };
  const claim = await corporationsCollection(db).updateOne(filter, {
    $set: { [field]: now, updatedAt: now },
  });
  return claim.matchedCount > 0;
}

export async function withCorporationSettlementLock<T>(
  db: Db,
  corporationId: ObjectId,
  field: CorporationSettlementLock,
  now: Date,
  run: () => Promise<T>,
  options: CorporationSettlementLockOptions = {}
): Promise<T | null> {
  const claimed = await claimCorporationSettlementLock(
    db,
    corporationId,
    field,
    now,
    options.staleAfterMs
  );
  if (!claimed) return null;

  try {
    return await run();
  } finally {
    await clearLock(db, corporationId, field, now);
  }
}
