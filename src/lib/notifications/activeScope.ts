import type { ObjectId } from "mongodb";
import type { CollectionSource } from "@/lib/db/repositories/source";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { usersCollection } from "@/lib/db/repositories/users";
import {
  characterScopeClause,
  resolveActiveCharacterScope,
  type ActiveCharacterScope,
} from "./characterScope";

/** The viewing character for a multi-character account, or null for a single-character one. */
export async function loadActiveCharacterScope(
  db: CollectionSource,
  userId: ObjectId
): Promise<ActiveCharacterScope | null> {
  const [user, characters] = await Promise.all([
    usersCollection(db).findOne({ _id: userId }, { projection: { activeCharacterId: 1 } }),
    charactersCollection(db)
      .find({ userId }, { projection: { _id: 1, createdAt: 1 } })
      .limit(20)
      .toArray(),
  ]);
  return resolveActiveCharacterScope(characters, user?.activeCharacterId);
}

/**
 * Clause that limits an unread count or list to the account's active
 * character, or null when the account has a single character. Merge it with
 * `{ $and: [clause] }`.
 */
export async function loadActiveCharacterNotificationClause(
  db: CollectionSource,
  userId: ObjectId
): Promise<Record<string, unknown> | null> {
  return characterScopeClause(userId, await loadActiveCharacterScope(db, userId));
}
