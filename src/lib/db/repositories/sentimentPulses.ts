import type { Collection, Document } from "mongodb";
import type { SentimentPulse } from "../types/sentimentPulse";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `sentimentPulses` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("sentimentPulses")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function sentimentPulsesCollection<TSchema extends Document = SentimentPulse>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("sentimentPulses");
}
