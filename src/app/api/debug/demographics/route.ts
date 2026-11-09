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
import type { GameState, State, StateDemographics } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getStateLean } from "@/lib/utils/demographics";
import { censusCachedStateLean } from "@/lib/demographics/cachedStateLean";
import { eraYearContextFromGameState } from "@/lib/era/context";

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

    const [demographics, defaults, state, gameState] = await Promise.all([
      db.collection<StateDemographics>("stateDemographics").findOne({ _id: stateId, countryId }),
      db.collection<StateDemographics>("demographicDefaults").findOne({ _id: stateId, countryId }),
      db.collection<State>("states").findOne({ _id: stateId, countryId }),
      db
        .collection<GameState>("gameState")
        .findOne(
          { _id: "current" },
          { projection: { preset: 1, currentYear: 1, currentTurn: 1, startingYear: 1 } }
        ),
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
      preset: gameState?.preset,
      demographicDefaults: defaults,
      ...eraYearContextFromGameState(gameState),
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
