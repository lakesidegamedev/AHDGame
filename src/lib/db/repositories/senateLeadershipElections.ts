import type { Collection, Document } from "mongodb";
import type { SenateLeadershipElection } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `senateLeadershipElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("senateLeadershipElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function senateLeadershipElectionsCollection<
  TSchema extends Document = SenateLeadershipElection,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("senateLeadershipElections");
}
