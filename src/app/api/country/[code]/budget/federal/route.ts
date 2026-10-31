// GET /api/country/[code]/budget/federal - Federal budget for a country.
// Auth: requireAuth
// Errors: 400, 404
//
// **Currency (v0.2.6):** All budget money fields are in the country's
// currency. Historical snapshots may lack `budget.currencyCode`, so the shared
// read model falls back to the country-derived display currency.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getCountryClientConfig } from "@/lib/constants/countryClientConfig";
import { getGameStateCore } from "@/lib/gameState";
import { getDb } from "@/lib/mongodb";
import { loadFederalBudgetDetail } from "@/lib/publicFinance/queries/federalBudgetDetail";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const db = await getDb();
    // The preset is independent of the budget read: issue both in one wave.
    const [detail, gameState] = await Promise.all([
      loadFederalBudgetDetail({
        db,
        countryId,
        requestUrl: request.url,
        // Drives the Finance-Minister lens gate. Only the seated finance-minister-
        // equivalent of this country resolves to isFinanceMinister=true.
        characterId: auth.user.character?._id,
      }),
      getGameStateCore(db),
    ]);
    if (!detail.ok) {
      return errorResponse(detail.status, detail.error);
    }

    // The page's approximate-dollar line reads this instead of shipping the
    // country registry to resolve the preset rate itself.
    return NextResponse.json({
      ...detail.body,
      usdExchangeRate: getCountryClientConfig(countryId, gameState?.preset).usdExchangeRate,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
