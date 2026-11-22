import { ObjectId } from "mongodb";

interface ScopeCharacter {
  _id: ObjectId;
  createdAt: Date;
}

export interface ActiveCharacterScope {
  characterId: string;
  /** Set for a character added after the account's first; older untagged alerts are not its own. */
  since: Date | null;
}

/**
 * Which character's inbox the account is looking at. Accounts with one
 * character need no scoping. With several, the active character (or the
 * oldest, when none is chosen) is the viewer.
 */
export function resolveActiveCharacterScope(
  characters: ScopeCharacter[],
  activeCharacterId: ObjectId | null | undefined
): ActiveCharacterScope | null {
  if (characters.length < 2) return null;
  const oldest = characters.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
  const active =
    characters.find((c) => activeCharacterId && c._id.equals(activeCharacterId)) ?? oldest;
  return {
    characterId: active._id.toString(),
    since: active._id.equals(oldest._id) ? null : active.createdAt,
  };
}

/**
 * Mongo clause limiting `ownUserId`'s alerts to the active character: alerts
 * tagged for it, plus untagged account-wide ones (only those created after the
 * character existed, for an added character). Other accounts in a notification
 * bundle are left alone.
 */
export function characterScopeClause(
  ownUserId: ObjectId,
  scope: ActiveCharacterScope | null
): Record<string, unknown> | null {
  if (!scope) return null;
  const untagged: Record<string, unknown> = {
    "metadata.recipientCharacterId": { $in: [null, ""] },
  };
  if (scope.since) untagged.createdAt = { $gte: scope.since };
  return {
    $or: [
      { userId: { $ne: ownUserId } },
      { "metadata.recipientCharacterId": scope.characterId },
      untagged,
    ],
  };
}

/** Mail is addressed to a character, so the inbox and its badge follow the active one. */
export function mailCharacterMatch(
  scope: ActiveCharacterScope | null
): { toCharacterId: ObjectId } | Record<string, never> {
  return scope ? { toCharacterId: new ObjectId(scope.characterId) } : {};
}
