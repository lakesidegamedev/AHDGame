import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getGameState } from "@/lib/gameState";
import { buildDistrictSquareViews } from "@/lib/redistricting/districtSquareResponse";
import type { CongressionalDistrict, Character, NPP, PoliticalParty } from "@/lib/db/types";
import { usCongressionalGeometryDirectory } from "@/lib/countries/us/congressionalGeometry";

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

      const parties = await politicalPartiesCollection(db)
        .find({ countryId: "US" }, { projection: { _id: 1, sequentialId: 1, abbreviation: 1 } })
        .toArray();
      const labels = Object.fromEntries(
        parties.flatMap((p) => [
          [String(p._id), p.abbreviation],
          [String(p.sequentialId), p.abbreviation],
          [p.abbreviation, p.abbreviation],
        ])
      );
      const views = buildDistrictSquareViews(
        parsed.districts.map((d) => d.cd),
        docs,
        holderNames,
        labels
      );
      const redistricting = { enabled: true, districts: views };

      return NextResponse.json({
        viewBox: parsed.viewBox,
        ...(parsed.geometrySource ? { geometrySource: parsed.geometrySource } : {}),
        ...(parsed.leanBasis ? { leanBasis: parsed.leanBasis } : {}),
        districts: baseDistricts,
        ...(redistricting ? { redistricting } : {}),
      });
    } catch {
      return errorResponse(404, `No CD data available for ${state}`);
    }
  } catch (error) {
    return handleRouteError(error);
  }
}

import { charactersCollection } from "@/lib/db/repositories/characters";

import { nppsCollection } from "@/lib/db/repositories/npps";

import { congressionalDistrictsCollection } from "@/lib/db/repositories/congressionalDistricts";

import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
