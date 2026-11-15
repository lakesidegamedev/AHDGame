import type { Collection, Document } from "mongodb";
import type { Corporation } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `corporations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("corporations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function corporationsCollection<TSchema extends Document = Corporation>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("corporations");
}
