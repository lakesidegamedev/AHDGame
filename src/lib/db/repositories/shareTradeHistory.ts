import type { Collection, Document } from "mongodb";
import type { ShareTradeHistory } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `shareTradeHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("shareTradeHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function shareTradeHistoryCollection<TSchema extends Document = ShareTradeHistory>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("shareTradeHistory");
}
