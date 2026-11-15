import type { Collection, Document } from "mongodb";
import type { FederalBudgetSnapshot } from "../types/budget";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `federalBudgetSnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("federalBudgetSnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function federalBudgetSnapshotsCollection<TSchema extends Document = FederalBudgetSnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("federalBudgetSnapshots");
}
