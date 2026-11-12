import type { Collection, Document } from "mongodb";
import type { CountryGameState } from "../types/gameState";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `countryGameStates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("countryGameStates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function countryGameStatesCollection<TSchema extends Document = CountryGameState>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("countryGameStates");
}
