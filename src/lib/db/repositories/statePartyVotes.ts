import type { Collection, Document } from "mongodb";
import type { StatePartyVote } from "../types/statePartyElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `statePartyVotes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("statePartyVotes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function statePartyVotesCollection<TSchema extends Document = StatePartyVote>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("statePartyVotes");
}
