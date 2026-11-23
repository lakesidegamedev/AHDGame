import { ObjectId } from "mongodb";
import type { CollectionSource } from "@/lib/db/repositories/source";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { usersCollection } from "@/lib/db/repositories/users";
import {
  characterScopeClause,
  resolveActiveCharacterScope,
  type ActiveCharacterScope,
} from "./characterScope";

/** Adds the corporations the scoped character runs, so other characters' corporation alerts stay out. */
export async function withOwnedCorporations(
  db: CollectionSource,
  scope: ActiveCharacterScope | null
): Promise<ActiveCharacterScope | null> {
  if (!scope) return null;
  const corps = await corporationsCollection(db)
    .find(
      { ceoId: new ObjectId(scope.characterId), ceoType: { $ne: "imperial" } },
      { projection: { _id: 1 } }
    )
    .limit(50)
    .toArray();
  return { ...scope, corporationIds: corps.map((c) => c._id.toString()) };
}

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
  return withOwnedCorporations(
    db,
    resolveActiveCharacterScope(characters, user?.activeCharacterId)
  );
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
