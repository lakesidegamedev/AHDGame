import type { Collection, Document } from "mongodb";
import type { NationalPartyElection } from "../types/nationalPartyElection";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalPartyElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalPartyElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalPartyElectionsCollection<TSchema extends Document = NationalPartyElection>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nationalPartyElections");
}
