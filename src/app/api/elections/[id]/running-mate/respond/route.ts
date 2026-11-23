/**
 * POST /api/elections/[id]/running-mate/respond
 * The invited player accepts or declines a running-mate invitation.
 * Only an accepted invitation puts a player on a presidential slate.
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody, schemas } from "@/lib/api/validate";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isHexObjectIdString } from "@/lib/utils/objectIdHex";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { respondToRunningMateInvitation } from "@/lib/elections/runningMateInvitations";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/elections/[id]/running-mate/respond — Accept or decline a running-mate invitation.
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 404, 409, 429
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const character = user.character;

    const rateLimit = checkRateLimit(
      `api/elections/[id]/running-mate/respond:${user.userId}`,
      10,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id: electionId } = await params;
    if (!isHexObjectIdString(electionId)) return errorResponse(400, "Invalid election ID");

    const parsed = await parseJsonBody(
      request,
      z.object({ nomineeCandidateId: schemas.objectId, accept: z.boolean() })
    );
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const election = await electionsCollection(db).findOne({ _id: new ObjectId(electionId) });
    if (!election || election.electionType !== "president") {
      return errorResponse(400, "Not a presidential election");
    }
    if (parsed.data.accept && election.status !== "active" && election.status !== "upcoming") {
      return errorResponse(400, "Election is not active");
    }

    const result = await respondToRunningMateInvitation(db, {
      electionId: election._id,
      nomineeCandidateId: new ObjectId(parsed.data.nomineeCandidateId),
      invitee: { _id: character._id, name: character.name },
      accept: parsed.data.accept,
    });
    if (!result.ok) return errorResponse(result.status, result.error);

    return NextResponse.json({
      success: true,
      accepted: result.accepted,
      message: result.accepted
        ? `You are now ${result.nomineeName}'s running mate.`
        : `You declined ${result.nomineeName}'s invitation.`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
