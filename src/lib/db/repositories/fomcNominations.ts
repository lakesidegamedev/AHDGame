import type { Collection, Document } from "mongodb";
import type { FomcNomination } from "../types/centralBank";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `fomcNominations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("fomcNominations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function fomcNominationsCollection<TSchema extends Document = FomcNomination>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("fomcNominations");
}
