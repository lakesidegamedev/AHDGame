import type { Collection, Document } from "mongodb";
import type { UnionOrganizer } from "../types/union";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `unionOrganizers` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("unionOrganizers")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function unionOrganizersCollection<TSchema extends Document = UnionOrganizer>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("unionOrganizers");
}
