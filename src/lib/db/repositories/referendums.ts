import type { Collection, Document } from "mongodb";
import type { Referendum } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `referendums` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("referendums")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function referendumsCollection<TSchema extends Document = Referendum>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("referendums");
}
