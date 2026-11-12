import type { Collection, Document } from "mongodb";
import type { LegislationType } from "../types/legislation";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `legislationTypes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("legislationTypes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function legislationTypesCollection<TSchema extends Document = LegislationType>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("legislationTypes");
}
