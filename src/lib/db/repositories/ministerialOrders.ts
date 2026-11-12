import type { Collection, Document } from "mongodb";
import type { MinisterialOrder } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `ministerialOrders` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("ministerialOrders")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function ministerialOrdersCollection<TSchema extends Document = MinisterialOrder>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("ministerialOrders");
}
