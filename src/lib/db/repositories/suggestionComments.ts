import type { Collection, Document } from "mongodb";
import type { SuggestionComment } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `suggestionComments` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("suggestionComments")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function suggestionCommentsCollection<TSchema extends Document = SuggestionComment>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("suggestionComments");
}
