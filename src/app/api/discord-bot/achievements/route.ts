import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBotToken } from "@/lib/api/requireBotToken";
import { checkRateLimit, rateLimitResponse, BOT_READ_LIMITS } from "@/lib/api/rateLimit";
import { lookupBotCharacter } from "@/lib/discord/botCharacterLookup";
import type { Achievement, CharacterAchievement } from "@/lib/db/types";

// GET /api/discord-bot/achievements — Returns a character's earned achievements, looked up by characterId, discordId, or name.
// Auth: requireAdminOrApiKey
// Errors: 400, 401
export async function GET(request: Request) {
  try {
    if (!requireBotToken(request)) {
      return errorResponse(401, "Unauthorized");
    }

    const rateLimit = checkRateLimit(
      "discord-bot:achievements",
      BOT_READ_LIMITS.maxRequests,
      BOT_READ_LIMITS.windowMs
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const lookup = await lookupBotCharacter(request);
    if (!lookup.ok) return lookup.response;
    const { db, character } = lookup;

    if (!character) {
      return NextResponse.json({ found: false, achievements: [] });
    }

    const earned = await db
      .collection<CharacterAchievement>("characterAchievements")
      .find({ characterId: character._id })
      .sort({ earnedAt: -1 })
      .toArray();

    if (earned.length === 0) {
      return NextResponse.json({
        found: true,
        characterId: character._id.toString(),
        characterName: character.name,
        achievements: [],
      });
    }

    const achievementIds = earned.map((e) => e.achievementId);
    const definitions = await db
      .collection<Achievement>("achievements")
      .find({ _id: { $in: achievementIds } })
      .toArray();

    const defMap = new Map(definitions.map((d) => [d._id.toString(), d]));

    const highlightedIds = new Set(
      (character.highlightedAchievementIds ?? []).map((id) => id.toString())
    );

    const achievements = earned.map((e) => {
      const def = defMap.get(e.achievementId.toString());
      return {
        id: e.achievementId.toString(),
        name: def?.name ?? "Unknown",
        description: def?.description ?? "",
        icon: def?.icon ?? "",
        category: def?.category ?? "special",
        isHidden: def?.isHidden ?? false,
        isHighlighted: highlightedIds.has(e.achievementId.toString()),
        earnedAt: e.earnedAt instanceof Date ? e.earnedAt.toISOString() : e.earnedAt,
      };
    });

    return NextResponse.json({
      found: true,
      characterId: character._id.toString(),
      characterName: character.name,
      achievements,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
