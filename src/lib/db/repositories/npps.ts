import type { Collection, Document } from "mongodb";
import type { NPP } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `npps` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("npps")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nppsCollection<TSchema extends Document = NPP>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("npps");
}
