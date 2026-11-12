import type { Collection, Document } from "mongodb";
import type { PartyBudget } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyBudget` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyBudget")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyBudgetCollection<TSchema extends Document = PartyBudget>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyBudget");
}
