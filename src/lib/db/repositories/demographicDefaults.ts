import type { Collection, Document } from "mongodb";
import type { StateDemographics } from "../types/demographics";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `demographicDefaults` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("demographicDefaults")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function demographicDefaultsCollection<TSchema extends Document = StateDemographics>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("demographicDefaults");
}
