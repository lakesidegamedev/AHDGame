import type { Collection, Document } from "mongodb";
import type { Bond } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `bonds` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("bonds")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function bondsCollection<TSchema extends Document = Bond>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("bonds");
}
