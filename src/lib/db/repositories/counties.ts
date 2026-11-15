import type { Collection, Document } from "mongodb";
import type { County } from "../types/county";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `counties` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("counties")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function countiesCollection<TSchema extends Document = County>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("counties");
}
