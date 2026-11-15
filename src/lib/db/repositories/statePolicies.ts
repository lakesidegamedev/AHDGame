import type { Collection, Document } from "mongodb";
import type { StatePolicy } from "../types/statePolicy";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `statePolicies` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("statePolicies")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function statePoliciesCollection<TSchema extends Document = StatePolicy>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("statePolicies");
}
