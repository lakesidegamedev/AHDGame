// GET /api/country/[code]/scotus/cases - Pending and decided Docket cases.
// Auth: requireBasicAuth
// Errors: 400, 401, 404
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getScotusCaseHistory, getScotusUpcomingCases } from "@/lib/scotus/queries";
import { getScotusPresetSeed } from "@/lib/scotus/presetData";
import { getGameStateCore } from "@/lib/gameState";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const { code } = await context.params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(404, "Country not found");
    }
    if (!countryHasFeature("supremeCourtDocket", countryId)) {
      return NextResponse.json({ cases: [], upcomingCases: [] });
    }

    const preset = new URL(request.url).searchParams.get("preset") ?? undefined;
    const db = await getDb();
    const [cases, upcomingCases, gameState] = await Promise.all([
      getScotusCaseHistory(db, countryId, preset),
      getScotusUpcomingCases(db, countryId, preset),
      getGameStateCore(db),
    ]);
    const seed = getScotusPresetSeed(preset ?? gameState?.preset ?? "");
    return NextResponse.json({ cases, upcomingCases, proceduralOnly: seed?.docket.length === 0 });
  } catch (error) {
    return handleRouteError(error);
  }
}
