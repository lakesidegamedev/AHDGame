import type { Collection, Document } from "mongodb";
import type { BillDiscussionReaction } from "../types/billDiscussion";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `billDiscussionReactions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("billDiscussionReactions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function billDiscussionReactionsCollection<
  TSchema extends Document = BillDiscussionReaction,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("billDiscussionReactions");
}
