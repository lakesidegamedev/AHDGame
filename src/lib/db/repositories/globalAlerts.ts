import type { Collection, Document } from "mongodb";
import type { GlobalAlert } from "../types/globalAlert";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `globalAlerts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("globalAlerts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function globalAlertsCollection<TSchema extends Document = GlobalAlert>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("globalAlerts");
}
