import type { Collection, Document } from "mongodb";
import type { NationalCommitteeElection } from "../types/nationalCommitteeElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalCommitteeElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalCommitteeElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalCommitteeElectionsCollection<
  TSchema extends Document = NationalCommitteeElection,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("nationalCommitteeElections");
}
