import type { Collection, Document } from "mongodb";
import type { BillDiscussion } from "../types/billDiscussion";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `billDiscussions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("billDiscussions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function billDiscussionsCollection<TSchema extends Document = BillDiscussion>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("billDiscussions");
}
