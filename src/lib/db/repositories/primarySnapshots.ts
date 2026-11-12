import type { Collection, Document } from "mongodb";
import type { PrimarySnapshot } from "../types/primarySnapshot";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `primarySnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("primarySnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function primarySnapshotsCollection<TSchema extends Document = PrimarySnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("primarySnapshots");
}
