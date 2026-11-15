import type { Collection, Document } from "mongodb";
import type { PoliticianOverride } from "../types/politicianOverride";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `politicianOverrides` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("politicianOverrides")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function politicianOverridesCollection<TSchema extends Document = PoliticianOverride>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("politicianOverrides");
}
