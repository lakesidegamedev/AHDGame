import type { Collection, Document } from "mongodb";
import type { CaucusChairCandidate } from "../types/caucusChairElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `caucusChairCandidates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("caucusChairCandidates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function caucusChairCandidatesCollection<TSchema extends Document = CaucusChairCandidate>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("caucusChairCandidates");
}
