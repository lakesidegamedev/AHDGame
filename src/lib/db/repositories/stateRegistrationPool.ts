import type { Collection, Document } from "mongodb";
import type { StateRegistrationPool } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `stateRegistrationPool` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("stateRegistrationPool")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function stateRegistrationPoolCollection<TSchema extends Document = StateRegistrationPool>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("stateRegistrationPool");
}
