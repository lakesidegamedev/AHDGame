import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { findPartyBySequentialId } from "@/lib/db/partyLookup";
import { getDb } from "@/lib/mongodb";
import {
  describeSlateActivity,
  getPartyActivityFeed,
  shouldIncludePartyOverviewTreasuryActivity,
} from "@/lib/parties/queries/activityFeed";

// GET /api/country/[code]/parties/[id]/activity-feed - Return the shared recent activity feed.
// Auth: requireAuth
// Errors: 400, 401, 404
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string; id: string }> }
) {
  try {
    const { code, id } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const party = await findPartyBySequentialId(db, id, countryId);
    if (!party) return errorResponse(404, "Party not found");

    const url = new URL(request.url);
    const beforeRaw = url.searchParams.get("before");
    const limitRaw = url.searchParams.get("limit");
    const before = beforeRaw ? new Date(beforeRaw) : null;
    if (before && Number.isNaN(before.getTime())) {
      return errorResponse(400, "Invalid 'before' timestamp");
    }
    // An unparseable `?limit` becomes NaN and reaches Mongo's `.limit()` as NaN
    // (`Math.max`/`Math.min` do not sanitize NaN), and `Number("")` is 0, not
    // NaN, so empty `?limit=` must fall back to the default rather than clamp to 1.
    const limitParsed = limitRaw === null || limitRaw.trim() === "" ? NaN : Number(limitRaw);
    const limit = Number.isFinite(limitParsed)
      ? Math.max(1, Math.min(100, Math.floor(limitParsed)))
      : 30;

    return NextResponse.json(
      await getPartyActivityFeed(db, {
        countryId,
        partyId: String(party.sequentialId),
        before,
        limit,
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export { describeSlateActivity, shouldIncludePartyOverviewTreasuryActivity };
