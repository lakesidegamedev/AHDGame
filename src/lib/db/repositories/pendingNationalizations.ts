import type { Collection, Document } from "mongodb";
import type { PendingNationalization } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `pendingNationalizations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("pendingNationalizations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function pendingNationalizationsCollection<
  TSchema extends Document = PendingNationalization,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("pendingNationalizations");
}
