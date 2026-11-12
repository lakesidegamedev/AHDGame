import type { Collection, Document } from "mongodb";
import type { SystemTag } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `systemTags` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("systemTags")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function systemTagsCollection<TSchema extends Document = SystemTag>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("systemTags");
}
