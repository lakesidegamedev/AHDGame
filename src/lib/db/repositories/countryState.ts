import type { Collection, Document } from "mongodb";
import type { CountryState } from "../types/countryState";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `countryState` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("countryState")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function countryStateCollection<TSchema extends Document = CountryState>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("countryState");
}
