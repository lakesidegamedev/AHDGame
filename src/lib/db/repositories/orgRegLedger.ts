import type { Collection, Document } from "mongodb";
import type { OrgRegLedger } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `orgRegLedger` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("orgRegLedger")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function orgRegLedgerCollection<TSchema extends Document = OrgRegLedger>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("orgRegLedger");
}
