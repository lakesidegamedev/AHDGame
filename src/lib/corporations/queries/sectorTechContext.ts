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
  type StrategyAvailabilityWorld,
  type TechCorpView,
} from "@/lib/constants/techTree";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { loadLaneBreakthroughResearch } from "@/lib/corporations/techTree/frontierResearch";
import { loadStrategyDiffusionWorld } from "@/lib/corporations/techTree/diffusion";

export interface SectorTechContext {
  techTreesEnabled: boolean;
  techCurrentYear: number;
  techCorpView: TechCorpView;
  strategyWorld: StrategyAvailabilityWorld;
}

export async function loadSectorTechContext(
  db: Db,
  input: {
    gameState: Pick<GameState, "sectorTechTreesEnabled" | "currentYear" | "currentTurn"> | null;
    corporation: Pick<
      Corporation,
      | "type"
      | "industryModel"
      | "mediaDiscriminator"
      | "unlockedTechNodeIds"
      | "techDecadeLane"
      | "frontierProgrammes"
      | "ceoType"
    >;
    sector: Pick<CorporateSector, "countryId">;
    lane: OperatingSectorType;
    preset: string | undefined;
  }
): Promise<SectorTechContext> {
  const { gameState, corporation } = input;
  const currentTurn = gameState?.currentTurn ?? 0;
  const techTreesEnabled = gameState?.sectorTechTreesEnabled === true;
  const techCurrentYear =
    gameState?.currentYear ??
    STARTING_YEAR + Math.floor((Math.max(1, currentTurn) - 1) / TURNS_PER_YEAR);
  const [sectorResearch, diffusion] = await Promise.all([
    loadLaneBreakthroughResearch(db, input.lane, techTreesEnabled),
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
    techCorpView: {
      type: corporation.type,
      industryModel: corporation.industryModel,
      mediaDiscriminator: corporation.mediaDiscriminator,
      unlockedTechNodeIds: corporation.unlockedTechNodeIds,
      techDecadeLane: corporation.techDecadeLane,
      frontierProgrammes: corporation.frontierProgrammes,
    },
    strategyWorld: { sectorResearch, diffusion },
  };
}

/** Tech-tree growth-cost reduction (%) shown on the financials panel. */
export function computeTechGrowthCostReductionPct(args: {
  techTreesEnabled: boolean;
  mediaOperatingModelsEnabled?: boolean;
  techCurrentYear: number;
  techCorpView: TechCorpView;
  sectorType: CorporationType;
  industryModel?: CorporateSector["industryModel"];
  mediaDiscriminator?: CorporateSector["mediaDiscriminator"];
}): number {
  const {
    techTreesEnabled,
    techCurrentYear,
    techCorpView,
    sectorType,
    industryModel,
    mediaDiscriminator,
  } = args;
  if (!techTreesEnabled) return 0;
  const effects = techCurrentYear
    ? getSectorTechEffectsForYear(
        techCorpView,
        sectorType,
        techCurrentYear,
        industryModel,
        mediaDiscriminator
      )
    : getSectorTechEffects(techCorpView, sectorType, industryModel, mediaDiscriminator);
  return Math.round((1 - effects.growthCostMultiplier) * 100 * 10) / 10;
}
