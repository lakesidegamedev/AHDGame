import type { Collection, Document } from "mongodb";
import type { ScotusNomination } from "../types/scotus";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `scotusNominations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("scotusNominations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function scotusNominationsCollection<TSchema extends Document = ScotusNomination>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("scotusNominations");
}
