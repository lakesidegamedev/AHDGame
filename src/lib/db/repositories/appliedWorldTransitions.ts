import type { Collection, Document } from "mongodb";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `appliedWorldTransitions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("appliedWorldTransitions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function appliedWorldTransitionsCollection<TSchema extends Document = Document>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("appliedWorldTransitions");
}
