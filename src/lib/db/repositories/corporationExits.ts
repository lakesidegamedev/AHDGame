import type { Collection, Document } from "mongodb";
import type { CorporationExit } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `corporationExits` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("corporationExits")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function corporationExitsCollection<TSchema extends Document = CorporationExit>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("corporationExits");
}
