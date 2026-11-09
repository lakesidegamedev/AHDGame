import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { buildCountryMacroHistory } from "@/lib/economy/queries/countryMacroHistory";
import { MACRO_HISTORY_DEFAULT_TURNS } from "@/lib/economy/rules/macroHistory";

interface RouteParams {
  params: Promise<{ code: string }>;
}

// GET /api/country/[code]/economy/history?turns=120&until=740 - national GDP,
// GDP per capita and population, one point per completed turn for every country.
// Auth: public. Read-only: served from durable macro telemetry, no turn work.
// Errors: 400
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const searchParams = new URL(request.url).searchParams;
    const rawTurns = searchParams.get("turns");
    const parsedTurns = rawTurns === null ? Number.NaN : Number(rawTurns);
    // The turn the caller last saw complete. It bounds the series, and because
    // it stays in the URL it is also the cache key: every client reacting to
    // the same turn shares one entry, and none of them accepts a body cached
    // before that turn finished.
    const rawUntil = searchParams.get("until");
    const parsedUntil = rawUntil === null ? Number.NaN : Number(rawUntil);

    const db = await getDb();
    const history = await buildCountryMacroHistory(
      db,
      countryId,
      Number.isFinite(parsedTurns) ? parsedTurns : MACRO_HISTORY_DEFAULT_TURNS,
      Number.isFinite(parsedUntil) ? parsedUntil : null
    );
    // Every open overview or economy page refetches this on turn completion,
    // so let the edge absorb a burst of identical reads during one turn.
    return NextResponse.json(history, {
      headers: {
        "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
