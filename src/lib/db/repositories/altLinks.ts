import type { Collection, Document } from "mongodb";
import type { AltLink } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `altLinks` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("altLinks")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function altLinksCollection<TSchema extends Document = AltLink>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("altLinks");
}
