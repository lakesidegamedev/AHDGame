import type { Collection, Document } from "mongodb";
import type { PartyDiscussionPost } from "../types/partyDiscussionPost";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyDiscussionPosts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyDiscussionPosts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyDiscussionPostsCollection<TSchema extends Document = PartyDiscussionPost>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyDiscussionPosts");
}
