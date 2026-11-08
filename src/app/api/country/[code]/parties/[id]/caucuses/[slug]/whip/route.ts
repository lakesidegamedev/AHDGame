import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, badRequest, notFound, errorResponse } from "@/lib/api/errors";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { findCaucusBySlug } from "@/lib/db/caucusLookup";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isWhippableChamber } from "@/lib/partyWhips/constraints";
import { caucusWhipSchema, issueCaucusWhip } from "@/lib/partyWhips/commands/issueCaucusWhip";

interface RouteParams {
  params: Promise<{ code: string; id: string; slug: string }>;
}

// POST /api/country/[code]/parties/[id]/caucuses/[slug]/whip — Issue a caucus-only whip directive for bills and leadership votes
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 403, 404, 429
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { code, id: partyId, slug } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const authResult = await requireAuthWithCharacter();
    if (!authResult.ok) return authResult.response;

    const rateLimit = checkRateLimit(
      `api/country/[code]/parties/[id]/caucuses/[slug]/whip:${authResult.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, caucusWhipSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    if (!isWhippableChamber(countryId, parsed.data.chamber)) {
      return NextResponse.json(badRequest("Invalid chamber for this country").toJson(), {
        status: 400,
      });
    }
    const db = await getDb();

    const party = await findPartyBySequentialId(db, partyId, countryId);
    if (!party) {
      return NextResponse.json(notFound("Party not found").toJson(), { status: 404 });
    }

    const resolved = await findCaucusBySlug(db, countryId, String(party.sequentialId), slug);
    if (!resolved) {
      return NextResponse.json(notFound("Caucus not found").toJson(), { status: 404 });
    }

    return await issueCaucusWhip({
      db,
      countryId,
      party,
      caucus: resolved.caucus,
      character: authResult.user.character,
      isAdmin: Boolean(authResult.user.isAdmin),
      input: parsed.data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
