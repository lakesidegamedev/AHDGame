import type { Collection, Document } from "mongodb";
import type { IndexFundTransaction } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `indexFundTransactions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("indexFundTransactions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function indexFundTransactionsCollection<TSchema extends Document = IndexFundTransaction>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("indexFundTransactions");
}
