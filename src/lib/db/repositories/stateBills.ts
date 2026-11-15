import type { Collection, Document } from "mongodb";
import type { StateBill } from "../types/stateBill";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `stateBills` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("stateBills")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function stateBillsCollection<TSchema extends Document = StateBill>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("stateBills");
}
