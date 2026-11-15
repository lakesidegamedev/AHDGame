import type { Collection, Document } from "mongodb";
import type { UnionLeaderVote } from "../types/union";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `unionLeaderVotes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("unionLeaderVotes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function unionLeaderVotesCollection<TSchema extends Document = UnionLeaderVote>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("unionLeaderVotes");
}
