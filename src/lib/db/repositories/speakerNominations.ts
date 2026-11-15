import type { Collection, Document } from "mongodb";
import type { SpeakerNomination } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `speakerNominations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("speakerNominations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function speakerNominationsCollection<TSchema extends Document = SpeakerNomination>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("speakerNominations");
}
