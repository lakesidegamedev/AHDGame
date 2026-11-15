import type { Collection, Document } from "mongodb";
import type { Subsidy } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `subsidies` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("subsidies")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function subsidiesCollection<TSchema extends Document = Subsidy>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("subsidies");
}
