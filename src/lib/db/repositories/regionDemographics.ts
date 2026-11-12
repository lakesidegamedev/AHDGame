import type { Collection, Document } from "mongodb";
import type { RegionDemographics } from "../types/regionDemographics";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `regionDemographics` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("regionDemographics")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function regionDemographicsCollection<TSchema extends Document = RegionDemographics>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("regionDemographics");
}
