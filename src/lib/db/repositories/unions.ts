import type { Collection, Document } from "mongodb";
import type { Union } from "../types/union";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `unions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("unions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function unionsCollection<TSchema extends Document = Union>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("unions");
}
