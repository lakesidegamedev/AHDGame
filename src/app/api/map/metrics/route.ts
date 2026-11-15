import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { loadUsPoliticalStateIds } from "@/lib/elections/usPoliticalHome";
import { loadMapMetrics } from "@/lib/map/metricsService";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

// GET /api/map/metrics: public current US state indicators; no player-specific fields.
export async function GET(request: Request) {
  if (
    !countryHasFeature(
      "usApi",
      (new URL(request.url).searchParams.get("countryId") ?? "US").toUpperCase()
    )
  ) {
    return errorResponse(400, "Metrics map is only available for the US");
  }
  try {
    const db = await getDb();
    const { politicalIds } = await loadUsPoliticalStateIds(db);
    return NextResponse.json(await loadMapMetrics(db, [...politicalIds]), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error, { request, route: "/api/map/metrics" });
  }
}
