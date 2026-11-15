import type { Collection, Document } from "mongodb";
import type { DemographicConfigOverride } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `demographicConfigOverrides` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("demographicConfigOverrides")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function demographicConfigOverridesCollection<
  TSchema extends Document = DemographicConfigOverride,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("demographicConfigOverrides");
}
