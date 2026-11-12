import type { Collection, Document } from "mongodb";
import type { NationalPartyVote } from "../types/nationalPartyElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalPartyVotes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalPartyVotes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalPartyVotesCollection<TSchema extends Document = NationalPartyVote>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nationalPartyVotes");
}
