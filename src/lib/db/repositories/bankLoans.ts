import type { Collection, Document } from "mongodb";
import type { BankLoan } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `bankLoans` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("bankLoans")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function bankLoansCollection<TSchema extends Document = BankLoan>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("bankLoans");
}
