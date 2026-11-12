import type { Collection, Document } from "mongodb";
import type { InterbankLoan } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `interbankLoans` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("interbankLoans")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function interbankLoansCollection<TSchema extends Document = InterbankLoan>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("interbankLoans");
}
