import type { Collection, Document } from "mongodb";
import type { BondHistory } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `bondHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("bondHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function bondHistoryCollection<TSchema extends Document = BondHistory>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("bondHistory");
}
