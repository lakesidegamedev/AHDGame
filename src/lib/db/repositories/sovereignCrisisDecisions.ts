import type { Collection, Document } from "mongodb";
import type { SovereignCrisisDecision } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `sovereignCrisisDecisions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("sovereignCrisisDecisions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function sovereignCrisisDecisionsCollection<
  TSchema extends Document = SovereignCrisisDecision,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("sovereignCrisisDecisions");
}
