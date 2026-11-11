import type { Collection, Document } from "mongodb";
import type { AdminLog } from "../types/adminLog";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `adminLogs` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("adminLogs")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function adminLogsCollection<TSchema extends Document = AdminLog>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("adminLogs");
}
