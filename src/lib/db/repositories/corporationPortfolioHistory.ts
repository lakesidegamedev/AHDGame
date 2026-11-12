import type { Collection, Document } from "mongodb";
import type { CorporationPortfolioHistory } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `corporationPortfolioHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("corporationPortfolioHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function corporationPortfolioHistoryCollection<
  TSchema extends Document = CorporationPortfolioHistory,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("corporationPortfolioHistory");
}
