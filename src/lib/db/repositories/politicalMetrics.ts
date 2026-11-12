import type { Collection, Document } from "mongodb";
import type { PoliticalMetricsDoc } from "../types/politicalMetrics";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `politicalMetrics` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("politicalMetrics")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function politicalMetricsCollection<TSchema extends Document = PoliticalMetricsDoc>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("politicalMetrics");
}
