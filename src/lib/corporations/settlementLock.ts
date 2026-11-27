import { withSessionDb, boundSession } from "@/lib/db/sessionDb";
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
    {
      _id: corporationId,
      bondSettlementInProgressAt: { $exists: false },
      dissolutionInProgressAt: { $exists: false },
    },
    { $set: { [field]: now, updatedAt: now } }
  );
  return claim.matchedCount > 0;
}

export async function withCorporationSettlementLock<T>(
  db: Db,
  corporationId: ObjectId,
  field: CorporationSettlementLock,
  now: Date,
  run: (transactionDb: Db) => Promise<T>
): Promise<T | null> {
  try {
    return await withSessionDb(db, async (transactionDb) => {
      const claimed = await claimCorporationSettlementLock(
        transactionDb,
        corporationId,
        field,
        now
      );
      if (!claimed) return null;
      const result = await run(transactionDb);
      if (result instanceof Response && !result.ok) throw new SettlementRefused(result);
      await clearLock(transactionDb, corporationId, field);
      return result;
    });
  } catch (error) {
    if (error instanceof SettlementRefused && !boundSession(db)) return error.result as T;
    throw error;
  }
}

class SettlementRefused extends Error {
  constructor(readonly result: Response) {
    super("Corporation settlement refused");
  }
}
