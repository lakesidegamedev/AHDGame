import type { Collection, Document } from "mongodb";
import type { Impeachment } from "../types/impeachment";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `impeachments` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("impeachments")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function impeachmentsCollection<TSchema extends Document = Impeachment>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("impeachments");
}
