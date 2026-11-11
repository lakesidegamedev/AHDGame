import type { Collection, Document } from "mongodb";
import type { StateApprovalHistory } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `stateApprovalHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("stateApprovalHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function stateApprovalHistoryCollection<TSchema extends Document = StateApprovalHistory>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("stateApprovalHistory");
}
