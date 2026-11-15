import type { Collection, Document } from "mongodb";
import type { ConfidenceVote } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `confidenceVotes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("confidenceVotes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function confidenceVotesCollection<TSchema extends Document = ConfidenceVote>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("confidenceVotes");
}
