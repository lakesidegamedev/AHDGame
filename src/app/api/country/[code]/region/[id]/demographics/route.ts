import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { State } from "@/lib/db/types";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { bucketProfileLean, getBucketProfileForRegion } from "@/lib/demographics/bucketProfile";
import { eraYearContextFromGameState } from "@/lib/era/context";
import { statesCollection } from "@/lib/db/repositories/states";

interface RouteParams {
  params: Promise<{ code: string; id: string }>;
}

// GET /api/country/[code]/region/[id]/demographics — Return the census bucket breakdown and political lean for a region
// Auth: public
// Errors: 400, 404
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { code, id } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }
    const stateId = id;

    const db = await getDb();

    const [state, gameState] = await Promise.all([
      statesCollection(db).findOne({ _id: stateId, countryId }),
      getGameStateCollection(db).then((games) =>
        games.findOne(
          { _id: "current" },
          { projection: { preset: 1, currentYear: 1, currentTurn: 1, startingYear: 1 } }
        )
      ),
    ]);
    if (!state) {
      return errorResponse(404, "State not found");
    }

    const sections = getBucketProfileForRegion(
      countryId,
      stateId,
      gameState?.preset,
      null,
      eraYearContextFromGameState(gameState)
    );
    if (!sections) {
      return errorResponse(404, "Demographics not found for this state");
    }

    const lean =
      state.cachedEconomicLean != null && state.cachedSocialLean != null
        ? { economicLean: state.cachedEconomicLean, socialLean: state.cachedSocialLean }
        : bucketProfileLean(sections);

    return NextResponse.json({
      stateId,
      stateName: state.name,
      calculatedEconomicLean: lean.economicLean,
      calculatedSocialLean: lean.socialLean,
      sections: sections.map((section) => ({
        id: section.dim,
        name: section.dimLabel,
        rows: section.buckets.map((b) => ({
          id: b.id,
          name: b.label,
          population: b.sharePct,
          economicLean: b.economicLean,
          socialLean: b.socialLean,
          turnout: b.turnout,
        })),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
