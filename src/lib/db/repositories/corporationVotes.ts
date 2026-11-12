import type { Collection, Document } from "mongodb";
import type { CorporationVote } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `corporationVotes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("corporationVotes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function corporationVotesCollection<TSchema extends Document = CorporationVote>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("corporationVotes");
}
