import type { Collection, Document } from "mongodb";
import type { PartyGroupFavorability } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyGroupFavorability` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyGroupFavorability")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyGroupFavorabilityCollection<TSchema extends Document = PartyGroupFavorability>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyGroupFavorability");
}
