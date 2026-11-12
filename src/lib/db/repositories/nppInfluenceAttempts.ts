import type { Collection, Document } from "mongodb";
import type { NPPInfluenceAttempt } from "../types/nppInfluence";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nppInfluenceAttempts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nppInfluenceAttempts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nppInfluenceAttemptsCollection<TSchema extends Document = NPPInfluenceAttempt>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nppInfluenceAttempts");
}
