import type { Collection, Document } from "mongodb";
import type { PlayerEndorsement } from "../types/nppInfluence";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `playerEndorsements` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("playerEndorsements")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function playerEndorsementsCollection<TSchema extends Document = PlayerEndorsement>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("playerEndorsements");
}
