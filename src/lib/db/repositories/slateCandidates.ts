import type { Collection, Document } from "mongodb";
import type { SlateCandidate } from "../types/recruitmentSlate";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `slateCandidates` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("slateCandidates")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function slateCandidatesCollection<TSchema extends Document = SlateCandidate>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("slateCandidates");
}
