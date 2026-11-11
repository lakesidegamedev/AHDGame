import type { Collection, Document } from "mongodb";
import type { CrisisInteraction } from "../types/crisis";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `crisisInteractions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("crisisInteractions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function crisisInteractionsCollection<TSchema extends Document = CrisisInteraction>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("crisisInteractions");
}
