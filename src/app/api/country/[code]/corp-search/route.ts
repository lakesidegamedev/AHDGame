// GET /api/country/[code]/corp-search?q=...
// Name search over private/NPC corporations HQ'd in the country, for the bill
// nationalize target picker (legislative full reach). Excludes state-owned corps.
// Auth: public read. Errors: 400
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { escapeRegex } from "@/lib/utils/escapeRegex";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json({ results: [] });

    const db = await getDb();
    const rows = await corporationsCollection(db)
      .find({
        countryId,
        countryOwnerId: { $exists: false },
        name: { $regex: escapeRegex(q), $options: "i" },
      })
      .limit(10)
      .toArray();

    const results = rows
      .filter((c) => !isStateOwned(c))
      .map((c) => ({ id: String(c._id), name: c.name, ticker: c.tickerSymbol ?? null }));
    return NextResponse.json({ results });
  } catch (error) {
    return handleRouteError(error);
  }
}
