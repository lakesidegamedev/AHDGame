import type { Collection, Document } from "mongodb";
import type { TreasuryTransaction } from "../types/treasuryTransaction";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `treasuryTransactions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("treasuryTransactions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function treasuryTransactionsCollection<TSchema extends Document = TreasuryTransaction>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("treasuryTransactions");
}
