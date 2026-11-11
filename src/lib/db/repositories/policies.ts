import type { Collection, Document } from "mongodb";
import type { Policy } from "../types/policy";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `policies` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("policies")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function policiesCollection<TSchema extends Document = Policy>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("policies");
}
