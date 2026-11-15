import type { Collection, Document } from "mongodb";
import type { CppccChairNomination } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `cppccChairNominations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("cppccChairNominations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function cppccChairNominationsCollection<TSchema extends Document = CppccChairNomination>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("cppccChairNominations");
}
