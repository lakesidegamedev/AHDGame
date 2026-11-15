import type { Collection, Document } from "mongodb";
import type { GameHealthSnapshot } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `gameHealthSnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("gameHealthSnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function gameHealthSnapshotsCollection<TSchema extends Document = GameHealthSnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("gameHealthSnapshots");
}
