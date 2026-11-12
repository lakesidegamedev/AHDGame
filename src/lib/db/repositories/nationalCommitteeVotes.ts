import type { Collection, Document } from "mongodb";
import type { NationalCommitteeVote } from "../types/nationalCommitteeElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalCommitteeVotes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalCommitteeVotes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalCommitteeVotesCollection<TSchema extends Document = NationalCommitteeVote>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nationalCommitteeVotes");
}
