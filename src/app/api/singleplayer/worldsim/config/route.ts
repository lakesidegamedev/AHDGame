import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { handleRouteError } from "@/lib/api/errors";
import type { GameState } from "@/lib/db/types";
import { MAX_WORLD_SIM_TURNS } from "@/lib/singleplayerWorld";
import { getSingleplayerConfig } from "@/lib/singleplayerServer";
import { getEnabledCountryIds } from "@/lib/countryAccess";
import {
  getCountryConfig,
  COUNTRY_CONFIGS,
  getCountryDisplayName,
} from "@/lib/constants/countries";
import { getWorldEntityPresetManifest } from "@/lib/world/worldEntityManifest";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

export const dynamic = "force-dynamic";

/**
 * Return the authored world controls the setup screen can display.
 *
 * Both axes are reported from persisted state, never invented here:
 *   - `autonomyLevel` (game state) — WHICH activities autonomous politicians may
 *     perform.
 *   - `difficulty` (singleplayerConfig) — HOW COMPETENTLY they perform them, plus
 *     the NPP resource tuning in `singleplayerDifficulty/rules/index.ts`. Local
 *     worlds only; a hosted world has no singleplayerConfig and reports the
 *     `normal` default, which is the shipped behavior.
 */
export async function GET(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const db = await getDb();
    const [state, singleplayerConfig, enabledIds] = await Promise.all([
      gameStateCollection(db).findOne(
        { _id: "current" },
        {
          projection: {
            currentTurn: 1,
            currentYear: 1,
            preset: 1,
            nppAutonomyLevel: 1,
            nppAutonomyEnabled: 1,
            forexEnabled: 1,
            playerRandomEventsEnabled: 1,
            nppEntryViabilityMode: 1,
            nppCorpStrategyEnabled: 1,
            sectorTechTreesEnabled: 1,
            eurozoneEnabled: 1,
          },
        }
      ),
      getSingleplayerConfig(db),
      getEnabledCountryIds(),
    ]);
    const enabled = new Set(enabledIds.map((id) => id.toUpperCase()));
    const seededByCountry = new Map(
      getWorldEntityPresetManifest(state?.preset ?? DEFAULT_SEED_PRESET)
        .entries.filter((entry) => entry.countryId)
        .map((entry) => [entry.countryId!, entry] as const)
    );
    const seededNations = [...seededByCountry.keys()].map((countryId) => {
      const config = getCountryConfig(countryId, state?.preset);
      return {
        id: countryId.toLowerCase(),
        name: getCountryDisplayName(countryId, state?.preset),
        governmentType: config.governmentType,
        headOfStateTitle: config.headOfStateTitle ?? null,
      };
    });
    const playableNations = Object.values(COUNTRY_CONFIGS)
      .filter((country) => enabled.has(country.id))
      .map((country) => ({
        id: country.id.toLowerCase(),
        name: getCountryDisplayName(country.id, state?.preset),
        governmentType: country.governmentType,
        headOfStateTitle: country.headOfStateTitle ?? null,
      }));

    return NextResponse.json(
      {
        maxTurns: MAX_WORLD_SIM_TURNS,
        mode: singleplayerConfig?.mode ?? null,
        difficulty: singleplayerConfig?.difficulty ?? "normal",
        autonomyLevel:
          singleplayerConfig?.nppAutonomyLevel ??
          state?.nppAutonomyLevel ??
          (state?.nppAutonomyEnabled ? "v0" : "off"),
        permanentHeadOfState: singleplayerConfig?.permanentHeadOfState === true,
        playableNations,
        // The spectator view needs the complete preset-scoped seeded roster,
        // including nations that are not currently enabled as player starts.
        nations: seededNations,
        turn: state?.currentTurn ?? null,
        year: state?.currentYear ?? null,
        preset: state?.preset ?? null,
        nppAutonomyLevel: state?.nppAutonomyLevel ?? (state?.nppAutonomyEnabled ? "v0" : "off"),
        featureFlags: {
          forexEnabled: state?.forexEnabled === true,
          playerRandomEventsEnabled: state?.playerRandomEventsEnabled === true,
          nppEntryViabilityMode: state?.nppEntryViabilityMode ?? "observe",
          nppCorpStrategyEnabled: state?.nppCorpStrategyEnabled !== false,
          sectorTechTreesEnabled: state?.sectorTechTreesEnabled === true,
          eurozoneEnabled: state?.eurozoneEnabled === true,
          ...singleplayerConfig?.featureFlags,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
