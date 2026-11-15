import type { Collection, Document } from "mongodb";
import type { PrimaryStateAction } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `primaryStateActions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("primaryStateActions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function primaryStateActionsCollection<TSchema extends Document = PrimaryStateAction>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("primaryStateActions");
}
