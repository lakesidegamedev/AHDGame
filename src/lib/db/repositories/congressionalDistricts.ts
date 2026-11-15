import type { Collection, Document } from "mongodb";
import type { CongressionalDistrict } from "../types/congressionalDistrict";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `congressionalDistricts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("congressionalDistricts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function congressionalDistrictsCollection<TSchema extends Document = CongressionalDistrict>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("congressionalDistricts");
}
