import { withNoStore } from "@/lib/api/withNoStore";
import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { State } from "@/lib/db/types";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { createCharacterSchema } from "@/lib/api/schemas/settings";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { createCharacterForAccount } from "@/lib/auth/characterCreation";
import { charactersCollection } from "@/lib/db/repositories/characters";

// POST /api/auth/character — Creates a new character for the authenticated user with starting stats and referral bonuses.
// Auth: requireBasicAuth
// Errors: 400, 401, 409, 429
export async function POST(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const userId = auth.user.userId;

    const rateLimit = checkRateLimit(`api/auth/character:${userId}`, 30, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, createCharacterSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    return await createCharacterForAccount(userId, parsed.data);
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/auth/character — Returns the current user's character document.
// `?include=homeState` adds the GDP and population the action cost quotes need,
// so /actions can price its cards from its first character request instead of
// following it with a state round trip.
// Auth: requireBasicAuth
// Errors: 401, 404
// GET endpoint to fetch current user's character
async function handleGET(request?: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const userId = auth.user.userId;

    const db = await getDb();
    // Scope by activeCharacterId when present so multi-character accounts resolve the
    // same character /api/auth/me uses. Without this, downstream pages (actions,
    // settings, etc.) silently operate on whichever character was inserted first.
    const userDoc = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) }, { projection: { activeCharacterId: 1 } });
    const characterQuery = userDoc?.activeCharacterId
      ? { _id: userDoc.activeCharacterId, userId: new ObjectId(userId) }
      : { userId: new ObjectId(userId) };
    const character = await charactersCollection(db).findOne(characterQuery);

    if (!character) {
      return errorResponse(404, "Character not found");
    }

    const includeHomeState = request
      ? new URL(request.url).searchParams.get("include")?.split(",").includes("homeState")
      : false;
    if (!includeHomeState || !character.homeState) {
      return NextResponse.json(character);
    }

    // Only the economics the cost quotes read, projected out of the state doc.
    const state = await db
      .collection<State>("states")
      .findOne(
        { _id: character.homeState, countryId: character.countryId },
        { projection: { gdp: 1, population: 1 } }
      );

    return NextResponse.json({
      ...character,
      homeStateEconomics:
        state && typeof state.gdp === "number" && typeof state.population === "number"
          ? { gdp: state.gdp, population: state.population }
          : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
