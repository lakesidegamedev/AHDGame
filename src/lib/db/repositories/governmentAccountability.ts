import type { Collection, Document } from "mongodb";
import type { GovernmentAccountability } from "../types/governmentAccountability";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `governmentAccountability` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("governmentAccountability")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function governmentAccountabilityCollection<
  TSchema extends Document = GovernmentAccountability,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("governmentAccountability");
}
