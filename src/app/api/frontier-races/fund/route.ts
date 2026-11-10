import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/validate";
import { canFundForCountry, isCeoOf } from "@/lib/frontierRaces/access";
import { fundFrontierRace } from "@/lib/frontierRaces/service";
import { getGameState } from "@/lib/gameState";
import { getDb } from "@/lib/mongodb";

const fundSchema = z.discriminatedUnion("kind", [
  z.object({
    raceId: z.string().min(1).max(40),
    kind: z.literal("country"),
    points: z.number().int().min(1).max(1000),
  }),
  z.object({
    raceId: z.string().min(1).max(40),
    kind: z.literal("corporation"),
    corporationId: z.string().min(1).max(40),
    points: z.number().int().min(1).max(1000),
  }),
]);

/**
 * POST /api/frontier-races/fund
 * A head of state or finance minister funds a programme from the treasury; a
 * corporation CEO funds one from research points.
 * Auth: requireAuthWithCharacter
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const limit = checkRateLimit(`api/frontier-races/fund:${auth.user.userId}`, 20, 60000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfter);
    const parsed = await parseJsonBody(request, fundSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const body = parsed.data;

    const db = await getDb();
    const actor = { userId: auth.user.userId, character: auth.user.character };
    const gameState = await getGameState();
    const turn = gameState?.currentTurn ?? 1;

    let entityId: string;
    if (body.kind === "country") {
      if (!(await canFundForCountry(db, actor))) {
        return errorResponse(403, "Only a head of state or finance minister can fund for a nation");
      }
      entityId = actor.character.countryId as string;
    } else {
      if (!(await isCeoOf(db, actor, body.corporationId))) {
        return errorResponse(403, "Only the CEO can fund for a corporation");
      }
      entityId = body.corporationId;
    }

    const result = await fundFrontierRace(db, {
      raceId: body.raceId,
      kind: body.kind,
      entityId,
      points: body.points,
      turn,
    });
    if (!result.ok) return errorResponse(result.status, result.message);
    return NextResponse.json({
      success: true,
      points: result.points,
      total: result.total,
      progress: result.progress,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
