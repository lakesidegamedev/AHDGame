import type { Collection, Document } from "mongodb";
import type { StateMetricBaseline } from "../types/statePolicy";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `stateBaselines` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("stateBaselines")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function stateBaselinesCollection<TSchema extends Document = StateMetricBaseline>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("stateBaselines");
}
