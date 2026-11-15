import type { Collection, Document } from "mongodb";
import type { ParliamentaryGovernment } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `parliamentaryGovernments` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("parliamentaryGovernments")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function parliamentaryGovernmentsCollection<
  TSchema extends Document = ParliamentaryGovernment,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("parliamentaryGovernments");
}
