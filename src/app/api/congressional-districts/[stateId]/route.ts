import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { buildDistrictSquareViews } from "@/lib/redistricting/districtSquareResponse";
import type { CongressionalDistrict, Character, NPP } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { congressionalDistrictsCollection } from "@/lib/db/repositories/congressionalDistricts";
import { usCongressionalGeometryDirectory } from "@/lib/maps/usCongressionalGeometry";

/**
 * Returns the static congressional-district geometry for a single US
 * state — the same JSON manifest that `subdivision-results` reads internally, but
 * stripped to just `viewBox` + `districts` for client surfaces that
 * render the shapes without needing a tally (e.g. the House-tier primary
 * drilldown).
 *
 * Auth: public
 * Errors: 400 (unknown stateId), 404 (no CD file shipped for the state)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ stateId: string }> }) {
  try {
    const { stateId } = await params;
    const state = stateId.toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) {
      return errorResponse(400, "Invalid state id");
    }

    const gs = await getGameState();
    const filePath = join(
      process.cwd(),
      "src",
      "data",
      usCongressionalGeometryDirectory(gs?.preset),
      `${state}.json`
    );
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        viewBox: string;
        geometrySource?: string;
        leanBasis?: string;
        districts: { cd: string; path: string; cookPVI: number }[];
      };
      const baseDistricts = parsed.districts.map((d) => ({
        cd: d.cd,
        path: d.path,
        cookPVI: d.cookPVI,
      }));

      // Live square overlay — only when the feature flag is on.
      let redistricting:
        { enabled: boolean; districts: ReturnType<typeof buildDistrictSquareViews> } | undefined;
      if (isRedistrictingEnabled(gs)) {
        const db = await getDb();
        const docs = (await congressionalDistrictsCollection(db)
          .find({ countryId: "US", stateId: state })
          .toArray()) as CongressionalDistrict[];

      const holderIds = docs
        .map((d) => d.holderCharacterId)
        .filter((id): id is NonNullable<typeof id> => id != null);
      const holderNppIds = docs
        .map((d) => d.holderNppId)
        .filter((id): id is NonNullable<typeof id> => id != null);
      const holderNames: Record<string, string> = {};
      if (holderIds.length > 0) {
        const chars = (await charactersCollection(db)
          .find({ _id: { $in: holderIds } })
          .toArray()) as Character[];
        for (const c of chars) holderNames[String(c._id)] = c.name;
      }
      // NPP holders live in a separate collection, keyed by holderNppId.
      if (holderNppIds.length > 0) {
        const npps = (await nppsCollection(db)
          .find({ _id: { $in: holderNppIds } })
          .toArray()) as NPP[];
        for (const n of npps) holderNames[String(n._id)] = n.name;
      }

      const views = buildDistrictSquareViews(
        parsed.districts.map((d) => d.cd),
        docs,
        holderNames
      );
      const redistricting = { enabled: true, districts: views };

      return NextResponse.json({
        viewBox: parsed.viewBox,
        ...(parsed.geometrySource ? { geometrySource: parsed.geometrySource } : {}),
        ...(parsed.leanBasis ? { leanBasis: parsed.leanBasis } : {}),
        districts: baseDistricts,
        redistricting,
      });
    } catch {
      return errorResponse(404, `No CD data available for ${state}`);
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
