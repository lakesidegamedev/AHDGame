import type { Collection, Document } from "mongodb";
import type { ActionAuditRecord } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `actionAuditLog` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("actionAuditLog")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function actionAuditLogCollection<TSchema extends Document = ActionAuditRecord>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("actionAuditLog");
}
