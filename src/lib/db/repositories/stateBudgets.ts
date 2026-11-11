import type { Collection, Document } from "mongodb";
import type { StateBudget } from "../types/budget";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `stateBudgets` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("stateBudgets")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function stateBudgetsCollection<TSchema extends Document = StateBudget>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("stateBudgets");
}
