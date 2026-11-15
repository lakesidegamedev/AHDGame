import type { Collection, Document } from "mongodb";
import type { SpeakerVacateMotion } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `speakerVacateMotions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("speakerVacateMotions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function speakerVacateMotionsCollection<TSchema extends Document = SpeakerVacateMotion>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("speakerVacateMotions");
}
