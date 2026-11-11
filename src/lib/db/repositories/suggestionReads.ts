import type { Collection, Document } from "mongodb";
import type { SuggestionRead } from "../types/suggestionRead";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `suggestionReads` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("suggestionReads")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function suggestionReadsCollection<TSchema extends Document = SuggestionRead>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("suggestionReads");
}
