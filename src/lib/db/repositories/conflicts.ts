import type { Collection, Document } from "mongodb";
import type { ConflictDoc } from "../types/conflict";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `conflicts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("conflicts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function conflictsCollection<TSchema extends Document = ConflictDoc>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("conflicts");
}
