import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireBotToken } from "@/lib/api/requireBotToken";
import { checkRateLimit, rateLimitResponse, BOT_READ_LIMITS } from "@/lib/api/rateLimit";
import { lookupBotCharacter } from "@/lib/discord/botCharacterLookup";

// GET /api/discord-bot/career — Returns a character's career history, looked up by characterId, discordId, or name.
// Auth: requireAdminOrApiKey
// Errors: 400, 401
export async function GET(request: Request) {
  try {
    if (!requireBotToken(request)) {
      return errorResponse(401, "Unauthorized");
    }

    const rateLimit = checkRateLimit(
      "discord-bot:career",
      BOT_READ_LIMITS.maxRequests,
      BOT_READ_LIMITS.windowMs
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const lookup = await lookupBotCharacter(request);
    if (!lookup.ok) return lookup.response;
    const { character } = lookup;

    if (!character) {
      return NextResponse.json({ found: false, career: [] });
    }

    const career = (character.careerHistory ?? []).map((event) => ({
      type: event.type,
      office: event.officeLabel,
      officeRaw: event.office,
      party: event.party ?? null,
      electionId: event.electionId ?? null,
      date: event.date instanceof Date ? event.date.toISOString() : event.date,
    }));

    // Most recent first
    career.reverse();

    return NextResponse.json({
      found: true,
      characterId: character._id.toString(),
      characterName: character.name,
      career,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
