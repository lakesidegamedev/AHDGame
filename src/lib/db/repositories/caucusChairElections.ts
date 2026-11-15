import type { Collection, Document } from "mongodb";
import type { CaucusChairElection } from "../types/caucusChairElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `caucusChairElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("caucusChairElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function caucusChairElectionsCollection<TSchema extends Document = CaucusChairElection>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("caucusChairElections");
}
