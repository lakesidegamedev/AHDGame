import type { Collection, Document } from "mongodb";
import type { CrisisAidCommitment } from "../types/crisisAid";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `crisisAidCommitments` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("crisisAidCommitments")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function crisisAidCommitmentsCollection<TSchema extends Document = CrisisAidCommitment>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("crisisAidCommitments");
}
