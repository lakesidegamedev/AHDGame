import type { Collection, Document } from "mongodb";
import type { NationalPartyCandidate } from "../types/nationalPartyElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalPartyCandidates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalPartyCandidates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalPartyCandidatesCollection<
  TSchema extends Document = NationalPartyCandidate,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("nationalPartyCandidates");
}
