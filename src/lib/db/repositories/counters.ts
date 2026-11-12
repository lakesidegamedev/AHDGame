import type { Collection, Document } from "mongodb";
import type { Counter } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `counters` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("counters")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function countersCollection<TSchema extends Document = Counter>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("counters");
}
