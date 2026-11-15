import type { Collection, Document } from "mongodb";
import type { FinancialTxLogEntry } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `financialTxLog` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("financialTxLog")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function financialTxLogCollection<TSchema extends Document = FinancialTxLogEntry>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("financialTxLog");
}
