import type { Collection, Document } from "mongodb";
import type { LocLedgerEntry } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `locLedger` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("locLedger")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function locLedgerCollection<TSchema extends Document = LocLedgerEntry>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("locLedger");
}
