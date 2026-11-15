import type { Collection, Document } from "mongodb";
import type { TradeHistoryEntry } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `tradeHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("tradeHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function tradeHistoryCollection<TSchema extends Document = TradeHistoryEntry>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("tradeHistory");
}
