import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { escapeRegex } from "@/lib/utils/escapeRegex";
import type { Character, User } from "@/lib/db/types";

export interface PatreonSearchUser {
  userId: string;
  username: string;
  characterName: string | null;
  patreonTier: User["patreonTier"] | null;
  patreonExpiresAt: User["patreonExpiresAt"] | null;
  patreonUserId: User["patreonUserId"] | null;
}

/**
 * Typeahead for the staff Patreon panels: an exact character id, else up to
 * ten username and ten character-name matches. Moderators pass
 * `excludeAdmins` so admin accounts never appear.
 */
export async function searchPatreonUsers(
  q: string,
  characterId: string,
  { excludeAdmins }: { excludeAdmins: boolean }
): Promise<PatreonSearchUser[]> {
  if (!q && !ObjectId.isValid(characterId)) return [];

  const db = await getDb();

  // The selector already identifies a character. Resolve that exact account
  // so duplicate names or common prefixes cannot select another player.
  if (ObjectId.isValid(characterId)) {
    const character = await db
      .collection<Character>("characters")
      .findOne({ _id: new ObjectId(characterId) });
    let user: User | null = null;
    if (character) {
      const filter: Filter<User> = { _id: character.userId };
      if (excludeAdmins) filter.role = { $ne: "admin" };
      user = await db.collection<User>("users").findOne(filter);
    }
    return user
      ? [
          {
            userId: user._id.toString(),
            username: user.username,
            characterName: character?.name ?? null,
            patreonTier: user.patreonTier ?? null,
            patreonExpiresAt: user.patreonExpiresAt ?? null,
            patreonUserId: user.patreonUserId ?? null,
          },
        ]
      : [];
  }

  const regex = new RegExp(escapeRegex(q), "i");

  const [users, characters] = await Promise.all([
    db.collection<User>("users").find({ username: regex }).limit(10).toArray(),
    db.collection<Character>("characters").find({ name: regex }).limit(10).toArray(),
  ]);

  const userIdsFromCharacters = characters.map((character) => character.userId);
  const characterUsers =
    userIdsFromCharacters.length > 0
      ? await db
          .collection<User>("users")
          .find({ _id: { $in: userIdsFromCharacters } })
          .toArray()
      : [];

  const usersById = new Map<string, User>();
  for (const user of [...users, ...characterUsers]) {
    if (excludeAdmins && user.role === "admin") continue;
    usersById.set(user._id.toString(), user);
  }

  const primaryCharacterByUserId = new Map<string, Character>();
  for (const character of characters) {
    primaryCharacterByUserId.set(character.userId.toString(), character);
  }

  return Array.from(usersById.values()).map((user) => ({
    userId: user._id.toString(),
    username: user.username,
    characterName: primaryCharacterByUserId.get(user._id.toString())?.name ?? null,
    patreonTier: user.patreonTier ?? null,
    patreonExpiresAt: user.patreonExpiresAt ?? null,
    patreonUserId: user.patreonUserId ?? null,
  }));
}
