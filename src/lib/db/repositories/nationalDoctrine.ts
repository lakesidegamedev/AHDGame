import type { Collection, Document } from "mongodb";
import type { NationalDoctrine } from "../types/nationalDoctrine";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalDoctrine` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalDoctrine")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalDoctrineCollection<TSchema extends Document = NationalDoctrine>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nationalDoctrine");
}
