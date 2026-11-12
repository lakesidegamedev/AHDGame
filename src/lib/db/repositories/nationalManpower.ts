import type { Collection, Document } from "mongodb";
import type { NationalManpower } from "../types/nationalManpower";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalManpower` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalManpower")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalManpowerCollection<TSchema extends Document = NationalManpower>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nationalManpower");
}
