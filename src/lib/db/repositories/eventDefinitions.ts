import type { Collection, Document } from "mongodb";
import type { EventDefinition } from "../types/events";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `eventDefinitions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("eventDefinitions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function eventDefinitionsCollection<TSchema extends Document = EventDefinition>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("eventDefinitions");
}
