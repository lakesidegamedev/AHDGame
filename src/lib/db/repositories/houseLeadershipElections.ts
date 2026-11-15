import type { Collection, Document } from "mongodb";
import type { HouseLeadershipElection } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `houseLeadershipElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("houseLeadershipElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function houseLeadershipElectionsCollection<
  TSchema extends Document = HouseLeadershipElection,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("houseLeadershipElections");
}
