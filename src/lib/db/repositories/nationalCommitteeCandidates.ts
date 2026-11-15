import type { Collection, Document } from "mongodb";
import type { NationalCommitteeCandidate } from "../types/nationalCommitteeElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalCommitteeCandidates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalCommitteeCandidates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalCommitteeCandidatesCollection<
  TSchema extends Document = NationalCommitteeCandidate,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("nationalCommitteeCandidates");
}
