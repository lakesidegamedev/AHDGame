import type { Collection, Document } from "mongodb";
import type { SettlementCrisisDoc } from "../types/settlementCrisis";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `settlementCrises` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("settlementCrises")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function settlementCrisesCollection<TSchema extends Document = SettlementCrisisDoc>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("settlementCrises");
}
