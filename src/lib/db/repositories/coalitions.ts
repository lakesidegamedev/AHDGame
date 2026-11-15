import type { Collection, Document } from "mongodb";
import type { Coalition } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `coalitions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("coalitions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function coalitionsCollection<TSchema extends Document = Coalition>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("coalitions");
}
