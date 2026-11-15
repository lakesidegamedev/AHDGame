import type { Collection, Document } from "mongodb";
import type { SavingsLedgerEntry } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `savingsLedger` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("savingsLedger")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function savingsLedgerCollection<TSchema extends Document = SavingsLedgerEntry>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("savingsLedger");
}
