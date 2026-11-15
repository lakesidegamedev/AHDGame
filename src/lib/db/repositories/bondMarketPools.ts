import type { Collection, Document } from "mongodb";
import type { BondMarketPool } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `bondMarketPools` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("bondMarketPools")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function bondMarketPoolsCollection<TSchema extends Document = BondMarketPool>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("bondMarketPools");
}
