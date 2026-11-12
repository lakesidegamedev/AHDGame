import type { Collection, Document } from "mongodb";
import type { Achievement } from "../types/achievement";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `achievements` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("achievements")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function achievementsCollection<TSchema extends Document = Achievement>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("achievements");
}
