import type { Collection, Document } from "mongodb";
import type { BillWhip } from "../types/billWhip";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `billWhips` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("billWhips")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function billWhipsCollection<TSchema extends Document = BillWhip>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("billWhips");
}
