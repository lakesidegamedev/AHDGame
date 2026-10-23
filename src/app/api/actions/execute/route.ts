import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireHumanSession } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { executeActionSchema } from "@/lib/api/schemas/actions";
import { ACTIONS, BATCHABLE_ACTION_TYPES } from "@/lib/actions";
import { executeCharacterAction } from "@/lib/actions/commands/executeAction";
import type { ActionType, Character, User } from "@/lib/db/types";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";

// POST /api/actions/execute — Executes a political action (optionally in batch) and applies its effects to the character
// Auth: requireHumanSession (bot tokens rejected)
// Errors: 400, 401, 403, 404, 429
//
// Request concerns (auth, rate-limit, batch/convert validation, character
// resolution, response shaping) live here; the action's effects + persistence
// are owned by the shared `executeCharacterAction` core so the autonomous NPP
// brain drives the same implementation.
export async function POST(request: Request) {
  const startedAt = Date.now();
  const timings = { authMs: 0, validationMs: 0, characterReadMs: 0, coreMs: 0 };
  let actionType: ActionType | undefined;
  let requestedCount: number | undefined;
  const finish = (response: Response) => {
    console.info("[action-request-timing]", {
      durationMs: Date.now() - startedAt,
      status: response.status,
      result: response.status < 400 ? "success" : response.status >= 500 ? "error" : "rejected",
      ...(actionType ? { actionType } : {}),
      ...(requestedCount != null ? { requestedCount } : {}),
      ...timings,
    });
    return response;
  };
  try {
    let stageStartedAt = Date.now();
    const auth = await requireHumanSession(request);
    timings.authMs += Date.now() - stageStartedAt;
    if (!auth.ok) return finish(auth.response);
    const user = auth.user;

    stageStartedAt = Date.now();
    const rateLimit = checkRateLimit(user.userId, 30, 60000);
    timings.authMs += Date.now() - stageStartedAt;
    if (!rateLimit.ok) return finish(rateLimitResponse(rateLimit.retryAfter));

    stageStartedAt = Date.now();
    const parsed = await parseJsonBody(request, executeActionSchema);
    timings.validationMs += Date.now() - stageStartedAt;
    if (!parsed.success) {
      return finish(errorResponse(parsed.status, parsed.error));
    }
    const {
      actionType: parsedActionType,
      targetState,
      convertAmount,
      count: rawCount,
    } = parsed.data;
    actionType = parsedActionType;
    const count = rawCount ?? 1;
    requestedCount = count;

    const action = ACTIONS[actionType];
    if (!action) {
      return finish(errorResponse(400, "Invalid action type"));
    }

    if (count > 1) {
      if (!BATCHABLE_ACTION_TYPES.includes(actionType as ActionType)) {
        return finish(errorResponse(400, "Batch execution is not available for this action."));
      }
      if (actionType === "convertCash") {
        return finish(errorResponse(400, "Batch execution is not available for this action."));
      }
    }

    if (count > 1 && convertAmount != null) {
      return finish(errorResponse(400, "Invalid request."));
    }

    if (action.requiresState && !targetState) {
      return finish(errorResponse(400, "This action requires a target state"));
    }

    const db = await getDb();

    // Resolve active character (admin accounts may have multiple characters)
    stageStartedAt = Date.now();
    const userDoc = await db.collection<User>("users").findOne({ _id: new ObjectId(user.userId) });
    const characterQuery = userDoc?.activeCharacterId
      ? { _id: userDoc.activeCharacterId, userId: new ObjectId(user.userId) }
      : { userId: new ObjectId(user.userId) };
    const character = await db.collection<Character>("characters").findOne(characterQuery);
    timings.characterReadMs += Date.now() - stageStartedAt;

    if (!character) {
      return finish(errorResponse(404, "Character not found"));
    }

    stageStartedAt = Date.now();
    const result = await executeCharacterAction(db, {
      character,
      characterQuery,
      actionType,
      targetState,
      convertAmount,
      count,
      actor: { userId: new ObjectId(user.userId), username: userDoc?.username },
    });
    timings.coreMs += Date.now() - stageStartedAt;

    if (!result.ok) {
      return finish(errorResponse(result.status, result.error));
    }

    return finish(
      NextResponse.json({
        success: true,
        message: result.message,
        character: result.updatedCharacter,
      })
    );
  } catch (error) {
    return finish(handleRouteError(error));
  }
}
