import type { Collection, Document } from "mongodb";
import type { NewsReaction } from "../types/newsPost";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `newsReactions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("newsReactions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function newsReactionsCollection<TSchema extends Document = NewsReaction>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("newsReactions");
}
