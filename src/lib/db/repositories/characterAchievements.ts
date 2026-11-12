import type { Collection, Document } from "mongodb";
import type { CharacterAchievement } from "../types/achievement";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `characterAchievements` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("characterAchievements")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function characterAchievementsCollection<TSchema extends Document = CharacterAchievement>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("characterAchievements");
}
