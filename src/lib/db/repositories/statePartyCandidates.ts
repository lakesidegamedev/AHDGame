import type { Collection, Document } from "mongodb";
import type { StatePartyCandidate } from "../types/statePartyElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `statePartyCandidates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("statePartyCandidates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function statePartyCandidatesCollection<TSchema extends Document = StatePartyCandidate>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("statePartyCandidates");
}
