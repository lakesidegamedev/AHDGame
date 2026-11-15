import type { Collection, Document } from "mongodb";
import type { Feedback } from "../types/feedback";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `feedback` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("feedback")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function feedbackCollection<TSchema extends Document = Feedback>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("feedback");
}
