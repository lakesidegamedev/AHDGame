/**
 * Achievement service: award, revoke, and query achievements.
 * All functions are non-throwing for use in hooks; return false on failure.
 *
 * Achievements are account-bound (keyed by userId). The optional characterId
 * records which character earned the achievement for historical context.
 */
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Achievement, CharacterAchievement } from "@/lib/db/types";
import {
  getCachedDefinitions,
  setCachedDefinitions,
  getCachedRarity,
  setCachedRarity,
  invalidateRarityCache,
} from "./cache";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { achievementsCollection } from "@/lib/db/repositories/achievements";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";
import { isAdditionalCharacter } from "@/lib/character/additionalCharacter";
import { loadCharacterNames } from "./characterNames";
import { normalizeEarnedAsName } from "./earnedAs";

/** Extra details stored on a new award row. */
export interface AwardOptions {
  /**
   * The name to store as the earning character. Defaults to the character's
   * current name; staff set it for hand grants that stand in for an award
   * earned by an earlier character.
   */
  characterName?: string;
}

/** The stored character name for a new award: the override, else the live name. */
async function resolveAwardCharacterName(
  db: Db,
  characterId: ObjectId | undefined,
  options: AwardOptions
): Promise<string | undefined> {
  const override = normalizeEarnedAsName(options.characterName);
  if (override) return override;
  if (!characterId) return undefined;
  return (await loadCharacterNames(db, [characterId])).get(characterId.toString());
}

/**
 * Whether a character already shows an achievement, judged by the same rule the
 * achievements page uses: its own rows, plus untagged legacy rows for the
 * account's first character. A row earned by a sibling character does not count.
 * Without a character the account-level row decides.
 */
async function rowsCoverCharacter(
  db: Db,
  userId: ObjectId,
  characterId: ObjectId | undefined,
  rows: Array<{ characterId?: ObjectId | null }>
): Promise<boolean> {
  if (rows.length === 0) return false;
  if (!characterId) return true;
  if (rows.some((row) => row.characterId?.equals(characterId))) return true;
  if (!rows.some((row) => !row.characterId)) return false;
  const character = await charactersCollection<{
    _id: ObjectId;
    userId: ObjectId;
    createdAt: Date;
  }>(db).findOne({ _id: characterId }, { projection: { _id: 1, userId: 1, createdAt: 1 } });
  if (!character) return true;
  return !(await isAdditionalCharacter(db, { ...character, userId }));
}

async function maybeAwardCompletionist(
  userId: ObjectId,
  awardedSlugs: string[],
  characterId?: ObjectId
): Promise<void> {
  if (awardedSlugs.includes("completionist")) return;
  try {
    const db = await getDb();
    const definitions = await getAllAchievements();
    const requiredIds = definitions
      .filter((definition) => definition.slug !== "completionist")
      .map((definition) => definition._id);
    if (requiredIds.length === 0) return;
    const rows = await characterAchievementsCollection(db)
      .find({ userId, achievementId: { $in: requiredIds } })
      .toArray();
    const held = new Set<string>();
    for (const row of rows) {
      if (characterId === undefined || (await rowsCoverCharacter(db, userId, characterId, [row]))) {
        held.add(row.achievementId.toString());
      }
    }
    if (held.size === requiredIds.length) {
      await awardAchievement(userId, "completionist", characterId);
    }
  } catch (error) {
    console.error("[achievements] completionist check error:", error);
  }
}

/**
 * Get achievement by slug. Uses cache when available.
 */
export async function getAchievementBySlug(slug: string): Promise<Achievement | null> {
  try {
    const cached = getCachedDefinitions();
    if (cached) {
      const found = cached.find((a) => a.slug === slug);
      if (found) return found;
    }

    const db = await getDb();
    const achievement = await achievementsCollection(db).findOne({ slug });
    return achievement;
  } catch (error) {
    console.error("[achievements] getAchievementBySlug error:", error);
    return null;
  }
}

/**
 * Get all achievements. Uses cache when available.
 */
export async function getAllAchievements(): Promise<Achievement[]> {
  try {
    const cached = getCachedDefinitions();
    if (cached) return cached;

    const db = await getDb();
    const list = await achievementsCollection(db).find({}).sort({ order: 1 }).toArray();
    setCachedDefinitions(list);
    return list;
  } catch (error) {
    console.error("[achievements] getAllAchievements error:", error);
    return [];
  }
}

/**
 * Award an achievement to an account. Idempotent.
 * @param userId - the account owner (primary FK for achievements)
 * @param achievementSlug - slug of the achievement definition
 * @param characterId - optional: which character earned it (historical context)
 * @param grantedBy - optional: admin who granted it
 * @param options - optional: stored character name override
 * @returns true if newly awarded, false if already had it or error
 */
export async function awardAchievement(
  userId: ObjectId,
  achievementSlug: string,
  characterId?: ObjectId,
  grantedBy?: ObjectId,
  options: AwardOptions = {}
): Promise<boolean> {
  try {
    const achievement = await getAchievementBySlug(achievementSlug);
    if (!achievement) {
      console.warn("[achievements] awardAchievement: achievement not found:", achievementSlug);
      return false;
    }

    const db = await getDb();

    const existingRows = await characterAchievementsCollection(db)
      .find({ userId, achievementId: achievement._id })
      .toArray();
    if (await rowsCoverCharacter(db, userId, characterId, existingRows)) return false;

    const characterName = await resolveAwardCharacterName(db, characterId, options);
    try {
      await characterAchievementsCollection(db).insertOne({
        _id: new ObjectId(),
        userId,
        characterId,
        achievementId: achievement._id,
        earnedAt: new Date(),
        grantedBy,
        ...(characterName ? { characterName } : {}),
      });
    } catch (insertError: unknown) {
      // Race condition: a concurrent call passed the findOne check and inserted first.
      // E11000 means the achievement is already recorded — treat as idempotent success path.
      const isDuplicate =
        insertError != null &&
        typeof insertError === "object" &&
        "code" in insertError &&
        (insertError as { code: number }).code === 11000;
      if (!isDuplicate) throw insertError;
      return false;
    }

    invalidateRarityCache();
    await maybeAwardCompletionist(userId, [achievementSlug], characterId);
    return true;
  } catch (error) {
    console.error("[achievements] awardAchievement error:", error);
    return false;
  }
}

/**
 * Award multiple achievements to an account in batch. Reduces N+1 queries
 * (1 definition lookup + 1 existing check + 1 insertMany) instead of 3N.
 * @param userId - the account owner (primary FK for achievements)
 * @param achievementSlugs - slugs to award
 * @param characterId - optional: which character earned them
 * @param grantedBy - optional: admin who granted them
 * @param options - optional: stored character name override
 * @returns number of newly awarded achievements
 */
export async function awardAchievements(
  userId: ObjectId,
  achievementSlugs: string[],
  characterId?: ObjectId,
  grantedBy?: ObjectId,
  options: AwardOptions = {}
): Promise<number> {
  if (achievementSlugs.length === 0) return 0;
  if (achievementSlugs.length === 1) {
    return (await awardAchievement(userId, achievementSlugs[0], characterId, grantedBy, options))
      ? 1
      : 0;
  }

  try {
    const db = await getDb();

    // 1. Resolve all definitions in one lookup (cache or single query)
    const cached = getCachedDefinitions();
    let achievements: Achievement[];
    if (cached) {
      achievements = cached.filter((a) => achievementSlugs.includes(a.slug));
    } else {
      achievements = await achievementsCollection(db)
        .find({ slug: { $in: achievementSlugs } })
        .toArray();
    }
    if (achievements.length === 0) return 0;

    // 2. Check which ones the account already has (single query)
    const achievementIds = achievements.map((a) => a._id);
    const existing = await characterAchievementsCollection(db)
      .find(
        { userId, achievementId: { $in: achievementIds } },
        { projection: { achievementId: 1, characterId: 1 } }
      )
      .toArray();
    const rowsByAchievement = new Map<string, typeof existing>();
    for (const row of existing) {
      const key = row.achievementId.toString();
      rowsByAchievement.set(key, [...(rowsByAchievement.get(key) ?? []), row]);
    }
    const existingIds = new Set<string>();
    for (const [key, rows] of rowsByAchievement) {
      if (await rowsCoverCharacter(db, userId, characterId, rows)) existingIds.add(key);
    }

    // 3. Insert only new ones in a single batch
    const pending = achievements.filter((a) => !existingIds.has(a._id.toString()));
    if (pending.length === 0) return 0;
    const characterName = await resolveAwardCharacterName(db, characterId, options);
    const toInsert: CharacterAchievement[] = pending.map((a) => ({
      _id: new ObjectId(),
      userId,
      characterId,
      achievementId: a._id,
      earnedAt: new Date(),
      grantedBy,
      ...(characterName ? { characterName } : {}),
    }));

    // ordered: false so duplicate-key races (concurrent award of same achievement)
    // insert the non-duplicate documents instead of aborting the entire batch.
    try {
      await characterAchievementsCollection(db).insertMany(toInsert, { ordered: false });
    } catch (bulkError: unknown) {
      // E11000 duplicate key errors are expected from race conditions — the
      // successful inserts still went through with ordered: false.
      const isDuplicateKeyOnly =
        bulkError != null &&
        typeof bulkError === "object" &&
        "code" in bulkError &&
        (bulkError as { code: number }).code === 11000;
      if (!isDuplicateKeyOnly) throw bulkError;
    }
    invalidateRarityCache();
    await maybeAwardCompletionist(
      userId,
      achievements.map((achievement) => achievement.slug),
      characterId
    );
    return toInsert.length;
  } catch (error) {
    console.error("[achievements] awardAchievements error:", error);
    return 0;
  }
}

/**
 * Revoke an achievement from an account.
 * @param userId - the account owner
 * @param achievementSlug - slug of the achievement to revoke
 * @returns true if revoked, false if didn't have it or error
 */
export async function revokeAchievement(
  userId: ObjectId,
  achievementSlug: string
): Promise<boolean> {
  try {
    const achievement = await getAchievementBySlug(achievementSlug);
    if (!achievement) {
      console.warn("[achievements] revokeAchievement: achievement not found:", achievementSlug);
      return false;
    }

    const db = await getDb();
    const result = await characterAchievementsCollection(db).deleteOne({
      userId,
      achievementId: achievement._id,
    });

    if (result.deletedCount > 0) {
      invalidateRarityCache();
      return true;
    }
    return false;
  } catch (error) {
    console.error("[achievements] revokeAchievement error:", error);
    return false;
  }
}

/**
 * Get all achievements earned by an account, with achievement details.
 * @param userId - the account owner
 */
export async function getAccountAchievements(
  userId: ObjectId,
  scope?: { characterId: ObjectId; includeUntagged: boolean }
): Promise<
  Array<{
    achievement: Achievement;
    earnedAt: Date;
    characterName?: string;
  }>
> {
  try {
    return await loadAccountAchievements(userId, scope);
  } catch (error) {
    console.error("[achievements] getAccountAchievements error:", error);
    return [];
  }
}

/**
 * Keep the rows a character may show: ones it earned, plus untagged legacy
 * rows unless the character was added after the account's first.
 */
export function filterAchievementRowsForCharacter<T extends { characterId?: ObjectId | null }>(
  rows: T[],
  scope: { characterId: ObjectId; includeUntagged: boolean }
): T[] {
  return rows.filter((row) =>
    row.characterId ? row.characterId.equals(scope.characterId) : scope.includeUntagged
  );
}

export async function loadAccountAchievements(
  userId: ObjectId,
  scope?: { characterId: ObjectId; includeUntagged: boolean }
) {
  const db = await getDb();
  const allRows = await characterAchievementsCollection(db).find({ userId }).toArray();
  const cas = scope ? filterAchievementRowsForCharacter(allRows, scope) : allRows;

  const achievementIds = cas.map((ca) => ca.achievementId);
  if (achievementIds.length === 0) return [];

  const achievements = await achievementsCollection(db)
    .find({ _id: { $in: achievementIds } })
    .toArray();

  const aMap = new Map(achievements.map((a) => [a._id.toString(), a]));
  return cas
    .map((ca) => {
      const a = aMap.get(ca.achievementId.toString());
      if (!a) return null;
      const characterName = normalizeEarnedAsName(ca.characterName) ?? undefined;
      return { achievement: a, earnedAt: ca.earnedAt, characterName };
    })
    .filter(
      (x): x is { achievement: Achievement; earnedAt: Date; characterName: string | undefined } =>
        x !== null
    )
    .sort((x, y) => x.achievement.order - y.achievement.order);
}

/**
 * Get rarity map: achievementId (string) -> % of accounts with it.
 * Denominator: accounts that own a character or hold an achievement.
 */
export async function getAchievementRarityMap(): Promise<Map<string, number>> {
  try {
    const cached = getCachedRarity();
    if (cached) return cached;

    const db = await getDb();
    // Rarity counts accounts, and the denominator is every account that plays
    // (owns a character or holds an achievement), so it can never pass 100%.
    const [characterUsers, holderUsers, counts] = await Promise.all([
      charactersCollection<{ userId: ObjectId }>(db).distinct("userId"),
      characterAchievementsCollection(db).distinct("userId"),
      characterAchievementsCollection(db)
        .aggregate<{ _id: ObjectId; count: number }>([
          { $group: { _id: { a: "$achievementId", u: "$userId" } } },
          { $group: { _id: "$_id.a", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const totalAccounts = new Set([...characterUsers, ...holderUsers].map(String)).size;
    if (totalAccounts === 0) {
      const empty = new Map<string, number>();
      setCachedRarity(empty);
      return empty;
    }

    const map = new Map<string, number>();
    for (const c of counts) {
      map.set(c._id.toString(), Math.min(100, (c.count / totalAccounts) * 100));
    }
    setCachedRarity(map);
    return map;
  } catch (error) {
    console.error("[achievements] getAchievementRarityMap error:", error);
    return new Map();
  }
}

/**
 * Resolve a characterId to its owning userId. Returns null if not found.
 * Useful for callers that only have characterId (e.g. turn processing).
 */
export async function resolveUserIdFromCharacter(characterId: ObjectId): Promise<ObjectId | null> {
  try {
    const db = await getDb();
    const character = await charactersCollection<{ _id: ObjectId; userId: ObjectId }>(db).findOne(
      { _id: characterId },
      { projection: { userId: 1 } }
    );
    return character?.userId ?? null;
  } catch (error) {
    console.error("[achievements] resolveUserIdFromCharacter error:", error);
    return null;
  }
}
