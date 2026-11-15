import type { Collection, Document } from "mongodb";
import type { WikiPage } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `wikiPages` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("wikiPages")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function wikiPagesCollection<TSchema extends Document = WikiPage>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("wikiPages");
}
