import type { Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export type CorporationSettlementLock = "bondSettlementInProgressAt" | "dissolutionInProgressAt";

async function clearLock(
  db: Db,
  corporationId: Corporation["_id"],
  field: CorporationSettlementLock
): Promise<void> {
  await corporationsCollection(db).updateOne({ _id: corporationId }, { $unset: { [field]: "" } });
}

async function claimCorporationSettlementLock(
  db: Db,
  corporationId: ObjectId,
  field: CorporationSettlementLock,
  now: Date
): Promise<boolean> {
  const claim = await corporationsCollection(db).updateOne(
    { _id: corporationId, [field]: { $exists: false } },
    { $set: { [field]: now, updatedAt: now } }
  );
  return claim.matchedCount > 0;
}

export async function withCorporationSettlementLock<T>(
  db: Db,
  corporationId: ObjectId,
  field: CorporationSettlementLock,
  now: Date,
  run: () => Promise<T>
): Promise<T | null> {
  const claimed = await claimCorporationSettlementLock(db, corporationId, field, now);
  if (!claimed) return null;

  try {
    return await run();
  } finally {
    await clearLock(db, corporationId, field);
  }
}
