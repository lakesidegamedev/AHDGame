import { getAuthUser } from "@/lib/auth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { buildRegionEconomyResponse } from "@/lib/country/regionEconomyView";

interface RouteParams {
  params: Promise<{ code: string; id: string }>;
}

// GET /api/country/[code]/region/[id]/economy — Return the economic sector breakdown for a region including corporate ownership
// Auth: public
// Errors: 400, 404
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { code, id } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const user = await getAuthUser();
    return await buildRegionEconomyResponse({
      countryId,
      stateId: id,
      user,
      modViewRequested: new URL(request.url).searchParams.get("modView") === "1",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
