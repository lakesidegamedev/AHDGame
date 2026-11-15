import type { Collection, Document } from "mongodb";
import type { FederalBudget } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `federalBudget` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("federalBudget")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function federalBudgetCollection<TSchema extends Document = FederalBudget>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("federalBudget");
}
