import type { Collection, Document } from "mongodb";
import type { MoneySupplySnapshot } from "../types/moneySupply";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `moneySupplySnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("moneySupplySnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function moneySupplySnapshotsCollection<TSchema extends Document = MoneySupplySnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("moneySupplySnapshots");
}
