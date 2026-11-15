import type { Collection, Document } from "mongodb";
import type { CaucusMembership } from "../types/caucus";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `caucusMemberships` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("caucusMemberships")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function caucusMembershipsCollection<TSchema extends Document = CaucusMembership>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("caucusMemberships");
}
