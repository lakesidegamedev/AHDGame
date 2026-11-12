import type { Collection, Document } from "mongodb";
import type { RedistrictLedgerEntry } from "../types/redistrictLedger";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `redistrictLedger` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("redistrictLedger")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function redistrictLedgerCollection<TSchema extends Document = RedistrictLedgerEntry>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("redistrictLedger");
}
