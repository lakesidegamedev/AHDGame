import type { Collection, Document } from "mongodb";
import type { PoliticalMetricsRegionHistoryDoc } from "../types/politicalMetrics";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `politicalMetricsRegionHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("politicalMetricsRegionHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function politicalMetricsRegionHistoryCollection<
  TSchema extends Document = PoliticalMetricsRegionHistoryDoc,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("politicalMetricsRegionHistory");
}
