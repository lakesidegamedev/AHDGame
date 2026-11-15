import type { Collection, Document } from "mongodb";
import type { GameConfig } from "../types/gameConfig";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `gameConfig` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("gameConfig")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function gameConfigCollection<TSchema extends Document = GameConfig>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("gameConfig");
}
