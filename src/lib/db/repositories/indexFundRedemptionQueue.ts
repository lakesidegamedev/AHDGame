import type { Collection, Document } from "mongodb";
import type { IndexFundRedemptionQueueEntry } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `indexFundRedemptionQueue` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("indexFundRedemptionQueue")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function indexFundRedemptionQueueCollection<
  TSchema extends Document = IndexFundRedemptionQueueEntry,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("indexFundRedemptionQueue");
}
