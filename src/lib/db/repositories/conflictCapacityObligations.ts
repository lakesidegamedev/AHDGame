import type { Collection, Document } from "mongodb";
import type { ConflictCapacityObligation } from "../types/conflictCapacity";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `conflictCapacityObligations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("conflictCapacityObligations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function conflictCapacityObligationsCollection<
  TSchema extends Document = ConflictCapacityObligation,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("conflictCapacityObligations");
}
