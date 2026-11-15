import type { Collection, Document } from "mongodb";
import type { EconomicVitalSigns } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `economicVitalSigns` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("economicVitalSigns")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function economicVitalSignsCollection<TSchema extends Document = EconomicVitalSigns>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("economicVitalSigns");
}
