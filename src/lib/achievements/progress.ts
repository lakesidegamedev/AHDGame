import type { Db } from "mongodb";
import type { Achievement, Character } from "@/lib/db/types";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import type { Document } from "mongodb";
import { actionLogsCollection } from "@/lib/db/repositories/actionLogs";
import { newsPostsCollection } from "@/lib/db/repositories/newsPosts";
import { userSubscriptionsCollection } from "@/lib/db/repositories/userSubscriptions";

export interface AchievementProgress {
  current: number;
  target: number;
}

type ProgressCharacter = Pick<Character, "_id" | "userId" | "funds" | "currencyBalances">;

export interface ProgressOptions {
  /** Local campaign currency per anchor unit, the rate the funds trigger awards at. */
  campaignRate?: number;
}

/**
 * Progress for many achievements with at most one query per source collection,
 * instead of one count per achievement. Keyed by achievement id.
 */
export async function getAchievementProgressMap(
  db: Db,
  character: ProgressCharacter,
  achievements: Achievement[],
  options: ProgressOptions = {}
): Promise<Map<string, AchievementProgress | null>> {
  const memo = new Map<string, Promise<number>>();
  const once = (key: string, load: () => Promise<number>): Promise<number> => {
    let hit = memo.get(key);
    if (!hit) {
      hit = load();
      memo.set(key, hit);
    }
    return hit;
  };

  let actionCounts: Promise<Map<unknown, number>> | undefined;
  const actionCountsByType = () => {
    actionCounts ??= actionLogsCollection<Document>(db)
      .aggregate<{ _id: unknown; n: number }>([
        { $match: { characterId: character._id } },
        { $group: { _id: "$actionType", n: { $sum: 1 } } },
      ])
      .toArray()
      .then((rows) => new Map(rows.map((row) => [row._id, row.n])));
    return actionCounts;
  };

  const countActions = async (types: unknown[] | null): Promise<number> => {
    const byType = await actionCountsByType();
    if (types === null) {
      let total = 0;
      for (const n of byType.values()) total += n;
      return total;
    }
    let total = 0;
    for (const type of new Set(types)) total += byType.get(type) ?? 0;
    return total;
  };

  const entries = await Promise.all(
    achievements.map(async (achievement) => {
      try {
        return [achievement._id.toString(), await progressFor(achievement)] as const;
      } catch (error) {
        console.error("[achievements] getAchievementProgress error:", error);
        return [achievement._id.toString(), null] as const;
      }
    })
  );
  return new Map(entries);

  async function progressFor(achievement: Achievement): Promise<AchievementProgress | null> {
    const config = achievement.triggerConfig ?? {};
    switch (achievement.triggerType) {
      case "action_count": {
        const target = Number(config.count);
        if (!Number.isFinite(target)) return null;
        const { actionType, actionTypes } = config;
        const types =
          typeof actionType === "string"
            ? [actionType]
            : Array.isArray(actionTypes)
              ? (actionTypes as unknown[])
              : null;
        return { current: await countActions(types), target };
      }
      case "election_won": {
        const target = Number(config.count);
        if (!Number.isFinite(target)) return null;
        const current = await once("elected", () =>
          electedOfficialsCollection<Document>(db).countDocuments({ characterId: character._id })
        );
        return { current, target };
      }
      case "influence_count": {
        const target = Number(config.count);
        return {
          current: await countActions(["supportPlayer", "attackPlayer", "barnstorm"]),
          target,
        };
      }
      case "subscriber_count": {
        const target = Number(config.count);
        const current = await once("subscribers", () =>
          userSubscriptionsCollection<Document>(db).countDocuments({
            subscribedToCharacterId: character._id,
          })
        );
        return { current, target };
      }
      case "funds_threshold": {
        const local = character.currencyBalances?.campaign ?? character.funds ?? 0;
        const rate = options.campaignRate && options.campaignRate > 0 ? options.campaignRate : 1;
        return { current: Math.floor(local / rate), target: Number(config.amount) };
      }
      case "news_reply": {
        const current = await once("replies", () =>
          newsPostsCollection<Document>(db).countDocuments({
            authorId: character._id,
            parentId: { $ne: null },
          })
        );
        return { current, target: Number(config.count ?? 5) };
      }
      default:
        return null;
    }
  }
}

export async function getAchievementProgress(
  db: Db,
  character: ProgressCharacter,
  achievement: Achievement
): Promise<AchievementProgress | null> {
  const map = await getAchievementProgressMap(db, character, [achievement]);
  return map.get(achievement._id.toString()) ?? null;
}
