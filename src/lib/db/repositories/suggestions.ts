import type { Collection, Document } from "mongodb";
import type { Suggestion } from "../types/suggestion";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `suggestions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("suggestions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function suggestionsCollection<TSchema extends Document = Suggestion>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("suggestions");
}
