import type { Collection, Document } from "mongodb";
import type { Notification } from "../types/notifications";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `notifications` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("notifications")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function notificationsCollection<TSchema extends Document = Notification>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("notifications");
}
