import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { Corporation, CorporateSector, GameState, SectorBuildOrder } from "@/lib/db/types";
import { getSectorStrategies } from "@/lib/constants/sectorStrategies";
import { STRATEGY_BUILD_SITE_PREFIX } from "@/lib/corporations/sectorLocation";
import { getStrategyAvailability } from "@/lib/constants/techTree";
import { DEFAULT_PROFIT_MARGIN } from "@/lib/constants/corporations";
import { resolvePresetIdFromGameState } from "@/lib/world/presetId";
import {
  loadPrerequisiteLaneResearch,
  loadSectorFrontierResearch,
} from "@/lib/corporations/techTree/frontierResearch";
import { loadStrategyDiffusionWorld } from "@/lib/corporations/techTree/diffusion";
import { isExtractionStrategyZeroYield } from "@/lib/corporations/extractionStrategyAvailability";
import { loadCommandEconomyBlockedCountries } from "@/lib/economy/queries/commandEconomyMarketGate";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { stateResourceCapacityCollection } from "@/lib/db/repositories/stateResourceCapacity";
import { corporateDiscretionaryCashGuard } from "@/lib/corporations/rules/discretionaryCash";
import {
  RequiredTransactionCleanupError,
  runRequiredTransaction,
} from "@/lib/db/runRequiredTransaction";

export function strategyBuildSiteIdentity(corporationId: ObjectId, requestId: string) {
  const nationalizationSiteKey = STRATEGY_BUILD_SITE_PREFIX + requestId;
  const id = createHash("sha256")
    .update(corporationId.toHexString())
    .update(nationalizationSiteKey)
    .digest("hex")
    .slice(0, 24);
  return { _id: new ObjectId(id), corporationId, nationalizationSiteKey };
}

export async function prepareStrategyBuildSite(
  db: Db,
  input: {
    identity: ReturnType<typeof strategyBuildSiteIdentity>;
    corporation: Corporation;
    source: CorporateSector;
    strategyId: string;
    countryId: CorporateSector["countryId"];
    gameState: GameState | null;
    currentTurn: number;
    currentYear: number;
    now: Date;
  }
): Promise<{ site: CorporateSector; error?: never } | { site?: never; error: string }> {
  const { corporation, source, strategyId, countryId, currentYear, gameState } = input;
  if ((source.strategyId ?? "standard") === strategyId) {
    return { error: "Choose a different strategy to open a separate site." };
  }
  const { sectorType, stateId } = source;
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { mediaOperatingModelsEnabled: 1 } }
  );
  const strategy = getSectorStrategies(
    sectorType,
    config?.mediaOperatingModelsEnabled === true,
    resolvePresetIdFromGameState(gameState)
  ).find((candidate) => candidate.id === strategyId);
  if (!strategy) return { error: "That strategy is unavailable for this sector." };

  const [sectorResearch, laneResearch, diffusion, deposits, blockedCountries] = await Promise.all([
    strategy.researchThreshold != null ? loadSectorFrontierResearch(db, sectorType) : undefined,
    loadPrerequisiteLaneResearch(db, [strategy], true),
    loadStrategyDiffusionWorld(db, {
      preset: gameState?.preset,
      techTreesEnabled: true,
      countryId,
      adopter: "player",
    }),
    sectorType === "extraction"
      ? stateResourceCapacityCollection(db).findOne({ stateId }, { projection: { resources: 1 } })
      : undefined,
    loadCommandEconomyBlockedCountries(db, [countryId]),
  ]);
  const availability = getStrategyAvailability(corporation, strategy, currentYear, true, {
    sectorResearch,
    laneResearch,
    diffusion,
  });
  if (availability.locked) {
    return {
      error: availability.opensYear
        ? `That strategy becomes available here in ${availability.opensYear}.`
        : "That strategy is unavailable here.",
    };
  }
  if (sectorType === "extraction" && isExtractionStrategyZeroYield(strategy, deposits?.resources)) {
    return { error: "This state has no deposits for that strategy." };
  }
  if (blockedCountries.has(countryId) && corporation.countryOwnerId !== countryId) {
    return { error: "Private corporations cannot open a new site in this market." };
  }

  return {
    site: {
      ...input.identity,
      sectorType,
      stateId,
      countryId,
      strategyId,
      displayName: strategy.name,
      capitalStock: 0,
      capacityBookAnchor: 0,
      plantCount: 0,
      plantUnitRemainder: 0,
      targetGrowthRate: 0,
      currentGrowthRate: 0,
      currentGrowthCost: 0,
      revenue: 0,
      profitMargin: DEFAULT_PROFIT_MARGIN,
      workers: 0,
      plantsStartTurn: input.currentTurn,
      createdAt: input.now,
      updatedAt: input.now,
    },
  };
}

type SiteBuildResult = "created" | "existing" | "insufficient_cash";

export async function placeStrategyBuildSite(
  db: Db,
  site: CorporateSector,
  order: SectorBuildOrder,
  chargedLocal: number
): Promise<SiteBuildResult> {
  const { _id, corporationId, nationalizationSiteKey, updatedAt } = site;
  try {
    return await runRequiredTransaction(async (session): Promise<SiteBuildResult> => {
      const existing = await corporateSectorsCollection(db).findOne(
        { _id, corporationId, nationalizationSiteKey },
        { session, projection: { _id: 1 } }
      );
      if (existing) return "existing";

      const debit = await corporationsCollection(db).updateOne(
        {
          _id: corporationId,
          liquidCapital: { $gte: chargedLocal },
          ...corporateDiscretionaryCashGuard(),
        },
        { $inc: { liquidCapital: -chargedLocal }, $set: { updatedAt } },
        { session }
      );
      if (debit.matchedCount !== 1) return "insufficient_cash";
      await corporateSectorsCollection(db).insertOne({ ...site, buildQueue: [order] }, { session });
      return "created";
    });
  } catch (error) {
    if (error instanceof RequiredTransactionCleanupError) {
      return error.committedResult as SiteBuildResult;
    }
    throw error;
  }
}
