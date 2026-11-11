import type { Collection, Document } from "mongodb";
import type { HouseLeadershipNomination } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `houseLeadershipNominations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("houseLeadershipNominations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function houseLeadershipNominationsCollection<
  TSchema extends Document = HouseLeadershipNomination,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("houseLeadershipNominations");
}
