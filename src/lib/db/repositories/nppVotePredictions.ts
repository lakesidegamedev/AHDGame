import type { Collection, Document } from "mongodb";
import type { NPPVotePrediction } from "../types/nppVotePrediction";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nppVotePredictions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nppVotePredictions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nppVotePredictionsCollection<TSchema extends Document = NPPVotePrediction>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nppVotePredictions");
}
