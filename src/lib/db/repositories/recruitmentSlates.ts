import type { Collection, Document } from "mongodb";
import type { RecruitmentSlate } from "../types/recruitmentSlate";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `recruitmentSlates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("recruitmentSlates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function recruitmentSlatesCollection<TSchema extends Document = RecruitmentSlate>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("recruitmentSlates");
}
