import type { Collection, Document } from "mongodb";
import type { MarketCapTick } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `marketCapTicks` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("marketCapTicks")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function marketCapTicksCollection<TSchema extends Document = MarketCapTick>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("marketCapTicks");
}
