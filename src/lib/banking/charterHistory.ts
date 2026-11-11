import { ObjectId, type Db } from "mongodb";
import type { BankCharter, BankCharterHistoryEntry } from "@/lib/db/types/bank";
import { bankCharterHistoryCollection } from "@/lib/db/repositories/bankCharterHistory";

export type CharterArchiveReason = BankCharterHistoryEntry["reason"];

/**
 * Snapshot a charter sub-doc into `bankCharterHistory` when it leaves active
 * use (revoke, failure, or overwrite on recharter).
 */
export async function archiveCharter(
  db: Db,
  corporationId: ObjectId,
  charter: BankCharter,
  archivedTurn: number,
  reason: CharterArchiveReason
): Promise<BankCharterHistoryEntry> {
  const entry: BankCharterHistoryEntry = {
    _id: new ObjectId(),
    corporationId,
    charter: { ...charter },
    archivedTurn,
    reason,
  };
  await bankCharterHistoryCollection(db).insertOne(entry);
  return entry;
}
