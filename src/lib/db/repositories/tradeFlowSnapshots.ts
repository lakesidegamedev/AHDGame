import type { Collection, Document } from "mongodb";
import type { TradeFlowSnapshot } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `tradeFlowSnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("tradeFlowSnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function tradeFlowSnapshotsCollection<TSchema extends Document = TradeFlowSnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("tradeFlowSnapshots");
}
