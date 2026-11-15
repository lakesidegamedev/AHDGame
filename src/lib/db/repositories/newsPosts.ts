import type { Collection, Document } from "mongodb";
import type { NewsPost } from "../types/newsPost";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `newsPosts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("newsPosts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function newsPostsCollection<TSchema extends Document = NewsPost>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("newsPosts");
}
