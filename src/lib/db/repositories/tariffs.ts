import type { Collection, Document } from "mongodb";
import type { Tariff } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `tariffs` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("tariffs")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function tariffsCollection<TSchema extends Document = Tariff>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("tariffs");
}
