import type { Db, ObjectId } from "mongodb";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { retiredCharactersCollection } from "@/lib/db/repositories/retiredCharacters";
import { usersCollection } from "@/lib/db/repositories/users";
import type { SearchResult } from "@/lib/search/types";

interface RetiredLife {
  userId: ObjectId;
  snapshot: { name: string; partyName?: string; homeState?: string };
}

/**
 * Retired lives matching a name. A retired life's own page is private to its
 * owner, so the result opens the player's current character, or the Legacy
 * leaderboard where the life is listed when they have none.
 */
export async function searchRetiredLives(
  db: Db,
  nameRegex: RegExp,
  enabledCountries: string[] | undefined,
  limit = 5
): Promise<SearchResult[]> {
  const filter: Record<string, unknown> = {
    "snapshot.name": nameRegex,
    "snapshot.isSynthetic": { $ne: true },
  };
  if (enabledCountries) filter["snapshot.countryId"] = { $in: enabledCountries };
  const lives = await retiredCharactersCollection(db)
    .find(filter)
    .project<RetiredLife>({
      userId: 1,
      "snapshot.name": 1,
      "snapshot.partyName": 1,
      "snapshot.homeState": 1,
    })
    .sort({ retiredAt: -1 })
    .limit(limit * 3)
    .toArray();
  const seen = new Set<string>();
  const unique = lives.filter((life) => {
    const key = `${String(life.userId)}|${life.snapshot.name}|${life.snapshot.homeState ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return [];
  const userIds = unique.map((life) => life.userId);
  const [banned, current] = await Promise.all([
    usersCollection(db)
      .find({ _id: { $in: userIds }, isBanned: true })
      .project<{ _id: ObjectId }>({ _id: 1 })
      .toArray(),
    charactersCollection(db)
      .find({ userId: { $in: userIds } })
      .project<{ _id: ObjectId; userId: ObjectId; name: string; sequentialId?: number }>({
        userId: 1,
        name: 1,
        sequentialId: 1,
      })
      .toArray(),
  ]);
  const bannedIds = new Set(banned.map((u) => String(u._id)));
  const currentByUser = new Map(current.map((c) => [String(c.userId), c]));
  return unique
    .filter((life) => !bannedIds.has(String(life.userId)))
    .slice(0, limit)
    .map((life, index) => {
      const now = currentByUser.get(String(life.userId));
      const where = [life.snapshot.partyName, life.snapshot.homeState].filter(Boolean).join(" · ");
      return {
        type: "politician" as const,
        id: `retired-${String(life.userId)}-${index}`,
        title: life.snapshot.name,
        subtitle: `Retired life${where ? ` · ${where}` : ""}${now ? ` · now plays ${now.name}` : " · listed on the Legacy leaderboard"}`,
        href: now ? `/character/${now.sequentialId ?? String(now._id)}` : "/world/legacy",
      };
    });
}
