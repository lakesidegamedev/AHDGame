import type { Collection, Document } from "mongodb";
import type { EnactedLaw } from "../types/budget";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `enactedLaws` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("enactedLaws")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function enactedLawsCollection<TSchema extends Document = EnactedLaw>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("enactedLaws");
}
