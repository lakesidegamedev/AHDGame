/**
 * Tech-tree context for the sector detail page: whether trees are on, the
 * world year, the corporation's tech view, the gate inputs for its production
 * methods (breakthrough research and, in diffusion worlds, country access),
 * and the growth-cost reduction shown on the financials panel.
 */
import type { Db } from "mongodb";
import type { CorporationType, OperatingSectorType } from "@/lib/constants/corporations";
import type { CorporateSector, Corporation, GameState } from "@/lib/db/types";
import {
  getSectorTechEffects,
  getSectorTechEffectsForYear,
  type LegacyTechContext,
  type StrategyAvailabilityWorld,
  type TechCorpView,
} from "@/lib/constants/techTree";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  loadLaneBreakthroughResearch,
  loadPrerequisiteLaneResearch,
} from "@/lib/corporations/techTree/frontierResearch";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import { loadLegacyTechContext } from "@/lib/corporations/techTree/legacyTechContext";
import { loadStrategyDiffusionWorld } from "@/lib/corporations/techTree/diffusion";

export interface SectorTechContext {
  techTreesEnabled: boolean;
  techCurrentYear: number;
  techCorpView: TechCorpView;
  /** Era context: how pre-start-decade tech nodes count in every effect read. */
  legacyTech: LegacyTechContext;
  strategyWorld: StrategyAvailabilityWorld;
}

export async function loadSectorTechContext(
  db: Db,
  input: {
    gameState: Pick<GameState, "currentYear" | "currentTurn"> | null;
    corporation: Pick<
      Corporation,
      | "type"
      | "unlockedTechNodeIds"
      | "techDecadeLane"
      | "frontierProgrammes"
      | "frontierMethods"
      | "ceoType"
    >;
    sector: Pick<CorporateSector, "countryId">;
    lane: OperatingSectorType;
    preset: string | undefined;
  }
): Promise<SectorTechContext> {
  const { gameState, corporation } = input;
  const currentTurn = gameState?.currentTurn ?? 0;
  const techTreesEnabled = true;
  const techCurrentYear =
    gameState?.currentYear ??
    STARTING_YEAR + Math.floor((Math.max(1, currentTurn) - 1) / TURNS_PER_YEAR);
  const [legacyTech, sectorResearch, laneResearch, diffusion] = await Promise.all([
    loadLegacyTechContext(db),
    loadLaneBreakthroughResearch(db, input.lane, techTreesEnabled),
    loadPrerequisiteLaneResearch(db, SECTOR_STRATEGIES[input.lane] ?? [], techTreesEnabled),
    // A player company may license early; an NPP corporation follows its country.
    loadStrategyDiffusionWorld(db, {
      preset: input.preset,
      techTreesEnabled,
      countryId: input.sector.countryId,
      adopter: corporation.ceoType === "npp" ? "npp" : "player",
    }),
  ]);
  return {
    techTreesEnabled,
    techCurrentYear,
    legacyTech,
    techCorpView: {
      type: corporation.type,
      unlockedTechNodeIds: corporation.unlockedTechNodeIds,
      techDecadeLane: corporation.techDecadeLane,
      frontierProgrammes: corporation.frontierProgrammes,
      frontierMethods: corporation.frontierMethods,
    },
    strategyWorld: { sectorResearch, laneResearch, diffusion },
  };
}

/** Tech-tree growth-cost reduction (%) shown on the financials panel. */
export function computeTechGrowthCostReductionPct(args: {
  techTreesEnabled: boolean;
  mediaOperatingModelsEnabled?: boolean;
  techCurrentYear: number;
  techCorpView: TechCorpView;
  legacyTech: LegacyTechContext;
  sectorType: CorporationType;
}): number {
  const { techTreesEnabled, techCurrentYear, techCorpView, legacyTech, sectorType } = args;
  if (!techTreesEnabled) return 0;
  const effects = techCurrentYear
    ? getSectorTechEffectsForYear(techCorpView, sectorType, techCurrentYear, legacyTech)
    : getSectorTechEffects(techCorpView, sectorType, legacyTech);
  return Math.round((1 - effects.growthCostMultiplier) * 100 * 10) / 10;
}
