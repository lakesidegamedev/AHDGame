import type { Collection, Document } from "mongodb";
import type { NPPRelationship } from "../types/nppInfluence";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nppRelationships` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nppRelationships")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nppRelationshipsCollection<TSchema extends Document = NPPRelationship>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nppRelationships");
}
