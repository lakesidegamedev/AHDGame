import type { Collection, Document } from "mongodb";
import type { WealthListSnapshot } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `wealthListSnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("wealthListSnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function wealthListSnapshotsCollection<TSchema extends Document = WealthListSnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("wealthListSnapshots");
}
