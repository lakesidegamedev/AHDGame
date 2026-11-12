/**
 * Debug endpoint for demographic lean calculation.
 * GET /api/debug/demographics?state=CA
 *
 * Returns the cached leans next to the lean read from the region census, to
 * diagnose why leans show as Center.
 * Only available to admins or when NODE_ENV !== "production".
 */

import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import type { State, StateDemographics } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getStateLean } from "@/lib/utils/demographics";
import { censusCachedStateLean } from "@/lib/demographics/cachedStateLean";
import { loadCampaignProjectionContext } from "@/lib/campaignTargeting/audience";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

// GET /api/debug/demographics — Debug demographic lean calculation for a given state; admin-only in production.
// Auth: requireAdmin
// Errors: 403
export async function GET(request: Request) {
  // Restrict to admins in production; allow unauthenticated in dev
  if (process.env.NODE_ENV === "production") {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const stateId = (searchParams.get("state") || "CA").toUpperCase();
  // Debug route — defaults to US when ?country is omitted (matches the legacy
  // CA default state). Scoping by country prevents cross-country state-ID
  // collisions (CN HB / DE HB) from resolving to the wrong state.
  const countryId = (searchParams.get("country") || "US").toUpperCase() as CountryId;

  try {
    const db = await getDb();

    const [demographics, state, context] = await Promise.all([
      stateDemographicsCollection(db).findOne({ _id: stateId, countryId }),
      statesCollection(db).findOne({ _id: stateId, countryId }),
      loadCampaignProjectionContext(db, [stateId]),
    ]);

    const debug: Record<string, unknown> = {
      stateId,
      hasDemographics: !!demographics,
      hasState: !!state,
      statePoliticalLean: state ? getStateLean(state) : null,
      stateCachedLeans: state
        ? {
            economic: (state as { cachedEconomicLean?: number }).cachedEconomicLean,
            social: (state as { cachedSocialLean?: number }).cachedSocialLean,
          }
        : null,
    };

    if (!demographics) {
      // eslint-disable-next-line local/no-uncoded-error-response -- diagnostic payload answered with 200, not an error response
      return NextResponse.json({
        ...debug,
        error: "No demographics found for this state",
        calculatedLeans: null,
      });
    }

    const censusLean = censusCachedStateLean(demographics, {
      countryId,
      stateId,
      preset: context.preset,
      demographicDefaults: context.defaultsByState.get(stateId),
      year: context.year,
      startingYear: context.startingYear,
    });

    return NextResponse.json({
      ...debug,
      categoryWeights: demographics.categoryWeights ?? null,
      calculatedLeans: censusLean,
      hasCensus: censusLean !== null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
