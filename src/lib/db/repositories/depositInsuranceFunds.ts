import type { Collection, Document } from "mongodb";
import type { DepositInsuranceFund } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `depositInsuranceFunds` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("depositInsuranceFunds")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function depositInsuranceFundsCollection<TSchema extends Document = DepositInsuranceFund>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("depositInsuranceFunds");
}
