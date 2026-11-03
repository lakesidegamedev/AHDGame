import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody, schemas } from "@/lib/api/validate";
import { getGameState } from "@/lib/gameState";
import { getCabinetPositionById } from "@/lib/constants";
import {
  describeBankOfficeConflict,
  findPendingCabinetNominationChoice,
  resolveCabinetNominationChoice,
} from "@/lib/cabinetNominationChoice";

/**
 * GET /api/cabinet/nomination-choice — the seat offer waiting on this player.
 * POST /api/cabinet/nomination-choice — answer it (accept or remain).
 */

export async function GET() {
  try {
    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;

    const db = await getDb();
    const gameState = await getGameState();
    const currentTurn = gameState?.currentTurn ?? 0;
    const character = authResult.user.character;

    const nomination = await findPendingCabinetNominationChoice(db, character._id, currentTurn);
    if (!nomination) return NextResponse.json({ choice: null });

    return NextResponse.json({
      choice: {
        nominationId: nomination._id.toString(),
        positionName: getCabinetPositionById(nomination.positionId)?.name ?? nomination.positionId,
        office: await describeBankOfficeConflict(db, character._id),
        expiresOnTurn: nomination.choiceExpiresOnTurn ?? currentTurn,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

const choiceSchema = z.object({
  nominationId: schemas.objectId,
  decision: z.enum(["accept", "remain"]),
});

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;

    const rateLimit = checkRateLimit(
      `api/cabinet/nomination-choice:${authResult.user.userId}`,
      15,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, choiceSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const gameState = await getGameState();
    const currentTurn = gameState?.currentTurn ?? 0;

    const result = await resolveCabinetNominationChoice(db, {
      nominationId: new ObjectId(parsed.data.nominationId),
      characterId: authResult.user.character._id,
      decision: parsed.data.decision,
      now: new Date(),
      currentTurn,
    });
    if (!result.ok) {
      return errorResponse(400, result.error ?? "That offer could not be answered.");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
