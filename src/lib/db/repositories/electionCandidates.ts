import type { Collection, Document } from "mongodb";
import type { ElectionCandidate } from "../types/election";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `electionCandidates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("electionCandidates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function electionCandidatesCollection<TSchema extends Document = ElectionCandidate>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("electionCandidates");
}
