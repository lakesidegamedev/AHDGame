import type { Collection, Document } from "mongodb";
import type { UnionEndorsement } from "../types/union";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `unionEndorsements` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("unionEndorsements")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function unionEndorsementsCollection<TSchema extends Document = UnionEndorsement>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("unionEndorsements");
}
