// src/app/api/parties/[id]/whip/route.ts
import { NextResponse } from "next/server";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import type { CountryId } from "@/lib/constants/countries";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import {
  issueNationalPartyWhip,
  nationalPartyWhipSchema,
} from "@/lib/partyWhips/commands/issueNationalPartyWhip";

interface RouteParams {
  params: Promise<{ code: string; id: string }>;
}

// POST /api/country/[code]/parties/[id]/whip — Issue a national party whip directive for a bill or leadership election
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 403, 404, 429
/**
 * POST /api/parties/[id]/whip
 * Create a whip directive for federal bills or leadership elections
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { code, id: partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    // Get authenticated user with character
    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;

    const rateLimit = checkRateLimit(
      `api/country/[code]/parties/[id]/whip:${authResult.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);
    const authData = authResult.user;

    const db = await getDb();

    // Get national party
    const party = await findPartyBySequentialId(db, partyId, countryId);

    if (!party) {
      return NextResponse.json(notFound("Party not found").toJson(), { status: 404 });
    }

    const parsed = await parseJsonBody(request, nationalPartyWhipSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const result = await issueNationalPartyWhip({
      db,
      countryId,
      party,
      character: authData.character,
      isAdmin: authData.isAdmin,
      request: parsed.data,
    });
    if (!result.ok) {
      return errorResponse(result.status, result.error);
    }
    return NextResponse.json(result.body);
  } catch (error) {
    return handleRouteError(error);
  }
}
