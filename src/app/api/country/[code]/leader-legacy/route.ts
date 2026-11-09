/**
 * GET /api/country/[code]/leader-legacy[?party=<sequentialId>]
 * Legacies of departed heads of government: score, what went into it, and the
 * decayed shift it still gives their party. Public, per-turn data.
 */
import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getDb } from "@/lib/mongodb";
import { loadLeaderLegacyView } from "@/lib/government/queries/leaderLegacyView";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) return errorResponse(400, "Invalid country code");
    const party = new URL(request.url).searchParams.get("party");
    const db = await getDb();
    const legacies = await loadLeaderLegacyView(db, countryId, { partyId: party || null });
    // cache policy: game-state, no shared cache
    return NextResponse.json(
      { legacies },
      { headers: { "Cache-Control": "no-store, no-transform" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
