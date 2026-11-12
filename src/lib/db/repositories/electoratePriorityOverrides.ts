import type { Collection, Document } from "mongodb";
import type { ElectoratePriorityOverride } from "../types/electoratePriorityOverride";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `electoratePriorityOverrides` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("electoratePriorityOverrides")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function electoratePriorityOverridesCollection<
  TSchema extends Document = ElectoratePriorityOverride,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("electoratePriorityOverrides");
}
