// GET /api/country/[code]/executive/cabinet/[positionId]/briefing
// Auth: public (actions restricted on frontend)
// Errors: 404
import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getCabinetMechanics } from "@/lib/constants/cabinetMechanics";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { buildCabinetBriefing } from "@/lib/cabinet/cabinetBriefing";

interface RouteParams {
  params: Promise<{ code: string; positionId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { code, positionId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country");
    }

    const mechanics = getCabinetMechanics(countryId, positionId);
    if (!mechanics) {
      return errorResponse(404, "Unknown cabinet position");
    }

    return NextResponse.json(await buildCabinetBriefing(countryId, positionId, mechanics));
  } catch (error) {
    return handleRouteError(error);
  }
}
