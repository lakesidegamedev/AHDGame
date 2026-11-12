import type { Collection, Document } from "mongodb";
import type { PoliticalParty } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `politicalParties` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("politicalParties")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function politicalPartiesCollection<TSchema extends Document = PoliticalParty>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("politicalParties");
}
