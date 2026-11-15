import type { Collection, Document } from "mongodb";
import type { StateMetrics } from "../types/stateMetrics";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `macroMetrics` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("macroMetrics")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function macroMetricsCollection<TSchema extends Document = StateMetrics>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("macroMetrics");
}
