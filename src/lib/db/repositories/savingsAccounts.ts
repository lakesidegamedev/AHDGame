import type { Collection, Document } from "mongodb";
import type { SavingsAccount } from "../types/savingsAccount";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `savingsAccounts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("savingsAccounts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function savingsAccountsCollection<TSchema extends Document = SavingsAccount>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("savingsAccounts");
}
