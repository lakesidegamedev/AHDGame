/**
 * POST /api/admin/demographics/reseed
 *
 * Upserts state demographics from seed data.
 * Admin-only. Clears stored polls from all characters so they commission
 * fresh polls from the reseeded electorate.
 *
 * Optional JSON body:
 *   { era?: EraId, countryId?: string, skipPollClear?: boolean }
 * Defaults: era="2019", countryId="US", skipPollClear=false
 * Callers that POST with no body get US/2019 behaviour.
 *
 * For !countryHasFeature("usApi", countryId), uses the international Layer-1 model path
 * (getCountryLayer1Model + buildModelRegionDemographics). Returns 400 if
 * no model exists for the requested country+era.
 *
 * A pre-reseed snapshot of the affected stateDemographics docs is written to
 * stateDemographicsBackup (last 3 per country+era kept).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getDb } from "@/lib/mongodb";
import type { Db } from "mongodb";
import type { State, StateDemographics } from "@/lib/db/types";
import { registerAndGenerate } from "@/lib/seeds/stateDemographics";
import { calculateStateLeanForCache } from "@/lib/demographics/cachedStateLean";
import type { Layer1Config } from "@/lib/seeds/stateDemographics";
import { SEED_ERA_IDS, type EraId } from "@/lib/seeds/presetSelector";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { charactersCollection } from "@/lib/db/repositories/characters";
import type { Document } from "mongodb";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

const VALID_ERAS = SEED_ERA_IDS;

const ReseedBodySchema = z
  .object({
    era: z.enum(VALID_ERAS).optional(),
    countryId: z.string().min(1).optional(),
    skipPollClear: z.boolean().optional(),
  })
  .optional();

// POST /api/admin/demographics/reseed — era-aware, international-scoped reseed.
// Auth: requireAdmin
// Errors: 403, 400 (unknown country+era)
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    // Parse optional body — empty/absent body falls back to defaults
    // (US/2019); a present-but-malformed body is rejected. Reads text +
    // Zod-validates rather than raw JSON parsing, per the validation convention.
    let era: EraId = "2019";
    let countryId = "US";
    let skipPollClear = false;
    const bodyResult = await parseJsonBody(request, ReseedBodySchema);
    if (bodyResult.success && bodyResult.data) {
      if (bodyResult.data.era) era = bodyResult.data.era;
      if (bodyResult.data.countryId) countryId = bodyResult.data.countryId;
      if (bodyResult.data.skipPollClear !== undefined)
        skipPollClear = bodyResult.data.skipPollClear;
    }

    const db = await getDb();

    // ── International path ──────────────────────────────────────────────────
    if (!countryHasFeature("usApi", countryId)) {
      const { getCountryLayer1Model, buildModelRegionDemographics } =
        await import("@/lib/seeds/international");
      const { loadFullOverride } = await import("@/lib/seeds/loadEraPositionOverride");

      const model = getCountryLayer1Model(countryId, era);
      if (!model) {
        return errorResponse(400, `No Layer-1 model for ${countryId}:${era}`);
      }

      const full = await loadFullOverride(countryId, era);
      const regionDemographics = buildModelRegionDemographics(
        model,
        full?.positions ?? undefined,
        full ? { turnout: full.turnout } : undefined
      );

      // Pre-reseed snapshot
      const regionIds = regionDemographics.map((r) => r._id);
      const snapshotId = await takeSnapshot(db, countryId, era, regionIds, auth.admin.username);

      for (const sd of regionDemographics) {
        const { groups: _groups, ...storedDemographics } = sd;
        await stateDemographicsCollection(db).updateOne(
          { _id: sd._id },
          { $set: storedDemographics },
          { upsert: true }
        );
        await db
          .collection<StateDemographics>("demographicDefaults")
          .updateOne({ _id: sd._id }, { $set: storedDemographics }, { upsert: true });
        const calculatedLean = calculateStateLeanForCache(sd, [], {
          countryId,
          stateId: sd._id,
          preset: `${era}-default`,
          demographicDefaults: sd,
        });
        await statesCollection(db).updateOne(
          { _id: sd._id },
          {
            $set: {
              cachedEconomicLean: calculatedLean.economicLean,
              cachedSocialLean: calculatedLean.socialLean,
              demographicsLastUpdated: new Date(),
            },
          }
        );
      }

      return NextResponse.json({
        success: true,
        countryId,
        era,
        snapshotId,
        statesCount: regionDemographics.length,
        message: `Reseeded ${regionDemographics.length} ${countryId} regions (era ${era}).`,
      });
    }

    // ── US path ─────────────────────────────────────────────────────────────
    const { loadEraFullOverride } = await import("@/lib/seeds/loadEraPositionOverride");
    const override = (await loadEraFullOverride(era)) ?? undefined;

    // Era-aware census bundle
    const { stateCensusData } = await import("@/lib/seeds/stateCensusData");
    const censusBundle = await resolveUsCensusBundle(
      era,
      stateCensusData as Record<string, Layer1Config>
    );

    const regenerated = Object.entries(censusBundle).map(([stateId, config]) =>
      registerAndGenerate(stateId, config, era, {
        layer1Positions: true,
        positions: override?.positions,
        turnout: override?.turnout,
      })
    );

    // Pre-reseed snapshot
    const stateIds = regenerated.map((r) => r._id);
    const snapshotId = await takeSnapshot(db, countryId, era, stateIds, auth.admin.username);

    // Clear stored polls (skippable to avoid disrupting active players)
    let charactersCleared = 0;
    if (!skipPollClear) {
      const charsResult = await charactersCollection<Document>(db).updateMany(
        {},
        { $unset: { lastPoll: "", lastPollLarge: "" } }
      );
      charactersCleared = charsResult.modifiedCount;
    }

    for (const sd of regenerated) {
      const calculatedLean = calculateStateLeanForCache(sd, [], {
        countryId: "US",
        stateId: sd._id,
        preset: `${era}-default`,
        demographicDefaults: sd,
      });
      const { groups: _groups, ...storedDemographics } = sd;
      const cachedDemographics = {
        ...storedDemographics,
        cachedEconomicLean: calculatedLean.economicLean,
        cachedSocialLean: calculatedLean.socialLean,
      };
      await stateDemographicsCollection(db).updateOne(
        { _id: sd._id },
        { $set: cachedDemographics },
        { upsert: true }
      );
      await db
        .collection<StateDemographics>("demographicDefaults")
        .updateOne({ _id: sd._id }, { $set: cachedDemographics }, { upsert: true });

      // Refresh cached leans on states
      await statesCollection(db).updateOne(
        { _id: sd._id },
        {
          $set: {
            cachedEconomicLean: calculatedLean.economicLean,
            cachedSocialLean: calculatedLean.socialLean,
            demographicsLastUpdated: new Date(),
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      countryId,
      era,
      snapshotId,
      skipPollClear,
      message: `Reseeded ${regenerated.length} state demographics (era ${era}). ${skipPollClear ? "Poll clear skipped." : `Cleared stored polls from ${charactersCleared} characters.`}`,
      statesCount: regenerated.length,
      charactersCleared,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

interface SnapshotDoc {
  _id: string;
  countryId: string;
  era: EraId;
  snapshotAt: string;
  triggeredBy: string;
  docs: unknown[];
}

/** Write current docs to stateDemographicsBackup; keep last 3 per country+era. */
async function takeSnapshot(
  db: Db,
  countryId: string,
  era: EraId,
  regionIds: string[],
  triggeredBy: string
): Promise<string> {
  const currentDocs = await stateDemographicsCollection<{ _id: string }>(db)
    .find({ _id: { $in: regionIds } })
    .toArray();

  const snapshotId = `${countryId}:${era}:${Date.now()}`;
  await db.collection<SnapshotDoc>("stateDemographicsBackup").insertOne({
    _id: snapshotId,
    countryId,
    era,
    snapshotAt: new Date().toISOString(),
    triggeredBy,
    docs: currentDocs,
  });

  // Prune: keep last 3 snapshots per country+era
  const all = await db
    .collection<SnapshotDoc>("stateDemographicsBackup")
    .find({ countryId, era })
    .sort({ snapshotAt: -1 })
    .toArray();
  if (all.length > 3) {
    const toDelete = all.slice(3).map((s) => s._id);
    await db
      .collection<SnapshotDoc>("stateDemographicsBackup")
      .deleteMany({ _id: { $in: toDelete } });
  }

  return snapshotId;
}

/** Return the correct US census bundle for the requested era. */
async function resolveUsCensusBundle(
  era: EraId,
  fallback: Record<string, Layer1Config>
): Promise<Record<string, Layer1Config>> {
  switch (era) {
    case "1953": {
      // 1979 shares proxy with the 1979-authored positions blocks stripped
      // (previously fell through to the 2019 fallback bundle).
      const { stateCensusData1953 } = await import("@/lib/seeds/stateCensusData1953");
      return stateCensusData1953;
    }
    case "1979": {
      const { stateCensusData1979 } = await import("@/lib/seeds/stateCensusData1979");
      return stateCensusData1979;
    }
    case "1991": {
      const { stateCensusData1991 } = await import("@/lib/seeds/stateCensusData1991");
      return stateCensusData1991;
    }
    case "1999": {
      const { stateCensusData1999 } = await import("@/lib/seeds/stateCensusData1999");
      return stateCensusData1999;
    }
    case "2007": {
      const { stateCensusData2007 } = await import("@/lib/seeds/stateCensusData2007");
      return stateCensusData2007;
    }
    case "2023": {
      const { stateCensusData2023 } = await import("@/lib/seeds/stateCensusData2023");
      return stateCensusData2023;
    }
    case "2027": {
      const { stateCensusData2027 } = await import("@/lib/seeds/stateCensusData2027");
      return stateCensusData2027;
    }
    case "2019":
      return fallback;
    default: {
      const unhandled: never = era;
      return unhandled;
    }
  }
}
