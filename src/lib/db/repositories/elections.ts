import type { Collection, Document } from "mongodb";
import type { Election } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `elections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("elections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function electionsCollection<TSchema extends Document = Election>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("elections");
}
