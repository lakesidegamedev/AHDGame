import type { Collection, Document } from "mongodb";
import type { CommodityPriceHistory } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `commodityPriceHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("commodityPriceHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function commodityPriceHistoryCollection<TSchema extends Document = CommodityPriceHistory>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("commodityPriceHistory");
}
