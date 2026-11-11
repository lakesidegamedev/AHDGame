import type { Collection, Document } from "mongodb";
import type { SpeakerElection } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `speakerElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("speakerElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function speakerElectionsCollection<TSchema extends Document = SpeakerElection>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("speakerElections");
}
