/**
 * Achievement service: award, revoke, and query achievements.
 * All functions are non-throwing for use in hooks; return false on failure.
 *
 * Achievements are account-bound (keyed by userId). The optional characterId
 * records which character earned the achievement for historical context.
 */
import { ObjectId } from "mongodb";
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
import { usersCollection } from "@/lib/db/repositories/users";
import type { Document } from "mongodb";
import { achievementsCollection } from "@/lib/db/repositories/achievements";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";

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
    const earnedCount = await characterAchievementsCollection(db).countDocuments({
      userId,
      achievementId: { $in: requiredIds },
    });
    if (earnedCount === requiredIds.length) {
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
 * @returns true if newly awarded, false if already had it or error
 */
export async function awardAchievement(
  userId: ObjectId,
  achievementSlug: string,
  characterId?: ObjectId,
  grantedBy?: ObjectId
): Promise<boolean> {
  try {
    const achievement = await getAchievementBySlug(achievementSlug);
    if (!achievement) {
      console.warn("[achievements] awardAchievement: achievement not found:", achievementSlug);
      return false;
    }

    const db = await getDb();

    const existing = await characterAchievementsCollection(db).findOne({
      userId,
      achievementId: achievement._id,
    });
    if (existing) return false;

    try {
      await characterAchievementsCollection(db).insertOne({
        _id: new ObjectId(),
        userId,
        characterId,
        achievementId: achievement._id,
        earnedAt: new Date(),
        grantedBy,
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
 * @returns number of newly awarded achievements
 */
export async function awardAchievements(
  userId: ObjectId,
  achievementSlugs: string[],
  characterId?: ObjectId,
  grantedBy?: ObjectId
): Promise<number> {
  if (achievementSlugs.length === 0) return 0;
  if (achievementSlugs.length === 1) {
    return (await awardAchievement(userId, achievementSlugs[0], characterId, grantedBy)) ? 1 : 0;
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
        { projection: { achievementId: 1 } }
      )
      .toArray();
    const existingIds = new Set(existing.map((e) => e.achievementId.toString()));

    // 3. Insert only new ones in a single batch
    const toInsert: CharacterAchievement[] = achievements
      .filter((a) => !existingIds.has(a._id.toString()))
      .map((a) => ({
        _id: new ObjectId(),
        userId,
        characterId,
        achievementId: a._id,
        earnedAt: new Date(),
        grantedBy,
      }));
    if (toInsert.length === 0) return 0;

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
export async function getAccountAchievements(userId: ObjectId): Promise<
  Array<{
    achievement: Achievement;
    earnedAt: Date;
  }>
> {
  try {
    const db = await getDb();
    const cas = await characterAchievementsCollection(db).find({ userId }).toArray();

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
        return { achievement: a, earnedAt: ca.earnedAt };
      })
      .filter((x): x is { achievement: Achievement; earnedAt: Date } => x !== null)
      .sort((x, y) => x.achievement.order - y.achievement.order);
  } catch (error) {
    console.error("[achievements] getAccountAchievements error:", error);
    return [];
  }
}

/**
 * Get rarity map: achievementId (string) -> % of accounts with it.
 * Denominator: total accounts with completed setup (players who have characters).
 */
export async function getAchievementRarityMap(): Promise<Map<string, number>> {
  try {
    const cached = getCachedRarity();
    if (cached) return cached;

    const db = await getDb();
    // Count accounts with characters rather than character docs
    const totalAccounts = await usersCollection<Document>(db).countDocuments({
      hasCompletedSetup: true,
    });
    if (totalAccounts === 0) {
      const empty = new Map<string, number>();
      setCachedRarity(empty);
      return empty;
    }

    const counts = await characterAchievementsCollection(db)
      .aggregate<{ _id: ObjectId; count: number }>([
        { $group: { _id: "$achievementId", count: { $sum: 1 } } },
      ])
      .toArray();

    const map = new Map<string, number>();
    for (const c of counts) {
      map.set(c._id.toString(), (c.count / totalAccounts) * 100);
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
