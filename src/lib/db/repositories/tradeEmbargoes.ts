import type { Collection, Document } from "mongodb";
import type { TradeEmbargo } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `tradeEmbargoes` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("tradeEmbargoes")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function tradeEmbargoesCollection<TSchema extends Document = TradeEmbargo>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("tradeEmbargoes");
}
