import type { Collection, Document } from "mongodb";
import type { CountryLeaderState } from "../types/countryLeaderState";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `countryLeaderStates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("countryLeaderStates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function countryLeaderStatesCollection<TSchema extends Document = CountryLeaderState>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("countryLeaderStates");
}
