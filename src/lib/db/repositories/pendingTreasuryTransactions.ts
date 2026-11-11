import type { Collection, Document } from "mongodb";
import type { PendingTreasuryTransaction } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `pendingTreasuryTransactions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("pendingTreasuryTransactions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function pendingTreasuryTransactionsCollection<
  TSchema extends Document = PendingTreasuryTransaction,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("pendingTreasuryTransactions");
}
