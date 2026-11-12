import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getRegionDetails } from "@/lib/maps/regionOwnership";
import { allRegionCodes } from "@/lib/maps/regionManifest";
import type { CountryId } from "@/lib/constants/countries";

// GET /api/maps/region-ownership
// Returns { ownership: { regionCode: countryId }, regions: {...} } for all
// region codes in the manifest. `ownership` drives map rendering; `regions`
// carries live preset-correct figures. Adding a shard auto-extends this.
export async function GET() {
  try {
    const db = await getDb();
    const regions = await getRegionDetails(db, allRegionCodes());
    const ownership: Record<string, CountryId> = {};
    for (const [code, detail] of Object.entries(regions)) {
      ownership[code] = detail.countryId;
    }
    return NextResponse.json({ ownership, regions });
  } catch (error) {
    return handleRouteError(error);
  }
}
