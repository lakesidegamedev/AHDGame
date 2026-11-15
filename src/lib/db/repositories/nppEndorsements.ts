import type { Collection, Document } from "mongodb";
import type { NPPEndorsement } from "../types/nppInfluence";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nppEndorsements` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nppEndorsements")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nppEndorsementsCollection<TSchema extends Document = NPPEndorsement>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nppEndorsements");
}
