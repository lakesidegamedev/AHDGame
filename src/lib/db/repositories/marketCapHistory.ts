import type { Collection, Document } from "mongodb";
import type { MarketCapHistory } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `marketCapHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("marketCapHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function marketCapHistoryCollection<TSchema extends Document = MarketCapHistory>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("marketCapHistory");
}
