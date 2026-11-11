import type { Collection, Document } from "mongodb";
import type { BankCharterHistoryEntry } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `bankCharterHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("bankCharterHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function bankCharterHistoryCollection<TSchema extends Document = BankCharterHistoryEntry>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("bankCharterHistory");
}
