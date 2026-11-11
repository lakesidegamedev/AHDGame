import type { Collection, Document } from "mongodb";
import type { ProspectingSurvey } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `prospectingSurveys` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("prospectingSurveys")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function prospectingSurveysCollection<TSchema extends Document = ProspectingSurvey>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("prospectingSurveys");
}
