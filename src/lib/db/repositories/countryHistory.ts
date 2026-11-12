import type { Collection, Document } from "mongodb";
import type { CountryHistoryEvent } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `countryHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("countryHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function countryHistoryCollection<TSchema extends Document = CountryHistoryEvent>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("countryHistory");
}
