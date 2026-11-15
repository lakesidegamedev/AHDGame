import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { regenerateCongressionalDistricts } from "@/lib/redistricting/regenerate";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { State } from "@/lib/db/types";
import { regionRedistrictUrl } from "@/lib/urls";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { statesCollection } from "@/lib/db/repositories/states";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

// POST /api/admin/country/[code]/region/[id]/redistrict/trigger — reset a state's
// district map to a neutral baseline and open it for manual redraw.
// Auth: requireAdmin
// Errors: 400, 403, 404
export const POST = withAdminRoute(
  async (
    auth,
    _request: Request,
    { params }: { params: Promise<{ code: string; id: string }> }
  ) => {
    const { code, id } = await params;
    const countryId = code.toUpperCase() as CountryId;
    const stateId = id.toUpperCase();
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }
    if (!countryHasFeature("usApi", countryId)) {
      return errorResponse(400, "Redistricting is only available for US states");
    }

    const db = await getDb();
    const state = await statesCollection(db).findOne({ _id: stateId, countryId });
    if (!state) {
      return errorResponse(404, "State not found");
    }

    const now = new Date();
    const gs = await gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { preset: 1 } }
    );
    const { regenerated } = await regenerateCongressionalDistricts(db, {
      countryId,
      stateIds: [stateId],
      preset: gs?.preset,
      now,
    });
    if (regenerated === 0) {
      return errorResponse(400, "No districts were generated for this state");
    }

    console.log(
      `[Admin] ${auth.admin.username} triggered redistricting for ${stateId} (${regenerated} districts reset)`
    );

    return NextResponse.json({
      success: true,
      message: `Reset ${regenerated} district(s) for ${stateId}. You can now redraw the map.`,
      redirectUrl: regionRedistrictUrl(countryId, stateId),
      regenerated,
    });
  }
);
