import type { Collection, Document } from "mongodb";
import type { SystemSettings } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `systemSettings` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("systemSettings")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function systemSettingsCollection<TSchema extends Document = SystemSettings>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("systemSettings");
}
