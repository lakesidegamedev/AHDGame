import { NextResponse } from "next/server";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { loadCountryMapOverview } from "@/lib/map/loadCountryMapOverview";

export type { MapOverviewResponse, MapSectorSpecializationState } from "@/lib/map/overviewTypes";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countryId = (searchParams.get("countryId") || "US").toUpperCase();
    if (!(countryId in COUNTRY_CONFIGS)) {
      return errorResponse(400, "Invalid country code");
    }
    return NextResponse.json(await loadCountryMapOverview(countryId as CountryId));
  } catch (error) {
    return handleRouteError(error, { request, route: "/api/map/overview" });
  }
}
