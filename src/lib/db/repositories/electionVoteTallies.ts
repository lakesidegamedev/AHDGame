import type { Collection, Document } from "mongodb";
import type { ElectionVoteTally } from "../types/voteTally";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `electionVoteTallies` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("electionVoteTallies")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function electionVoteTalliesCollection<TSchema extends Document = ElectionVoteTally>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("electionVoteTallies");
}
