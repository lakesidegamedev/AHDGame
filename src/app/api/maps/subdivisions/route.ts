import {
  SUBDIVISION_REGION_PATTERN,
  subdivisionRegionMatchesCountry,
} from "@/lib/maps/rules/region";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { getSubdivisionMode } from "@/lib/maps/subdivisionConfig";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";

/** Unit nouns for the US layers, whose registry entries carry none. */
const FOLDER_LABELS: Record<string, { one: string; many: string }> = {
  counties: { one: "County", many: "Counties" },
  "congressional-districts": { one: "District", many: "Districts" },
};

const querySchema = z.object({
  country: z.string().regex(/^[A-Z]{2,3}$/),
  type: z.string().min(1).max(64),
  // regionId feeds a filesystem path: region-code shapes only.
  region: z.string().regex(SUBDIVISION_REGION_PATTERN),
});

// GET /api/maps/subdivisions?country=US&type=governor&region=SD — one region's
// sub-unit shapes (counties, districts, constituencies) for a race type, from
// the same era-aware files the results routes draw. Needs no tally, so a map
// can draw a race's sub-units before its first votes are counted.
// Auth: public (geometry only, no results)
// Errors: 400, 404
export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      country: request.nextUrl.searchParams.get("country")?.toUpperCase(),
      type: request.nextUrl.searchParams.get("type"),
      region: request.nextUrl.searchParams.get("region")?.toUpperCase(),
    });
    if (!parsed.success) return errorResponse(400, "Invalid query parameters");
    const { country, type, region } = parsed.data;
    if (!subdivisionRegionMatchesCountry(country, region))
      return errorResponse(400, "Region country mismatch");

    const layer = request.nextUrl.searchParams.get("layer");
    if (layer && layer !== "census-divisions") return errorResponse(400, "Invalid map layer");
    const modeEntry = getSubdivisionMode(country, type, layer);
    if (!modeEntry) return errorResponse(404, "No sub-unit map for this race type");

    const db = await getDb();
    const file = await loadSubdivisionFile(modeEntry.config.dataDir, region, {
      preset: await getGameStatePresetOrDefault(db),
    });
    if (!file) return errorResponse(404, "Sub-unit map data not available for this region");

    return NextResponse.json({
      viewBox: file.viewBox,
      notice: file.notice,
      unitLabel:
        modeEntry.config.unitLabel ?? FOLDER_LABELS[modeEntry.config.dataDir]?.one ?? "Subdivision",
      unitLabelPlural:
        modeEntry.config.unitLabelPlural ??
        FOLDER_LABELS[modeEntry.config.dataDir]?.many ??
        "Subdivisions",
      subdivisions: file.subdivisions.map((s) => ({ id: s.id, name: s.name, path: s.path })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
