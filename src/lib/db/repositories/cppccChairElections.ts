import type { Collection, Document } from "mongodb";
import type { CppccChairElection } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `cppccChairElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("cppccChairElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function cppccChairElectionsCollection<TSchema extends Document = CppccChairElection>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("cppccChairElections");
}
