import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import {
  ADVERTISING_INPUT_STANDARD_1991_DEMAND,
  ADVERTISING_INPUT_VARIANT_DEMAND,
} from "@/lib/constants/sectorStrategyAdvertisingOverlay";
import {
  isCorporationType,
  operatingSectorTypeFor,
  type ManufacturingIndustryModel,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import type { CommodityType } from "@/lib/constants/commodities";
import { hardwareInputMultiplier } from "./hardwareInputRelief";
import {
  MEDIA_OPERATING_MODELS,
  mediaOperatingModelOutputRates,
  type MediaOperatingModelSector,
} from "@/lib/mediaOperatingModels/catalog";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { DEFAULT_DEMAND_1991 } from "@/lib/constants/sectorStrategyDefinitions1991";
import {
  MARKET_ECONOMY_MEDIA_SUPPLY_FACTOR,
  PLANNED_ECONOMY_MEDIA_SUPPLY_FACTOR,
  SECTOR_STRATEGIES,
  STRATEGY_TRANSITION_TURNS,
  type EffectiveStrategyRates,
  type SectorStrategy,
  type StrategyOptions,
} from "@/lib/constants/sectorStrategiesTables";

/**
 * Sector operating strategy rules: strategy lookup, transition blending and the
 * media supply derate. Unknown persisted sector types resolve to an inert
 * strategy; the shell in constants/sectorStrategies reports them.
 */

const UNKNOWN_SECTOR_STRATEGY: SectorStrategy = {
  id: "standard",
  name: "Unknown sector",
  description: "Production is unavailable until this sector type is recognized.",
  supply: {},
  demand: {},
};

/**
 * Build the model recipes from existing physical input baskets and output
 * patterns. Output rates retain the default sector's base-value budget; input
 * costs remain on the ordinary strategy demand and physical-cost rails.
 */
export function getMediaOperatingModelStrategies(sectorType: string): SectorStrategy[] {
  if (sectorType !== "media" && sectorType !== "media_entertainment") return [];
  const lane = sectorType as MediaOperatingModelSector;
  const strategies = SECTOR_STRATEGIES[sectorType as OperatingSectorType];
  const baseline = strategies.find((strategy) => strategy.id === "standard");
  if (!baseline) return [];

  return MEDIA_OPERATING_MODELS.flatMap((model) => {
    const recipe = model.recipes[lane];
    if (!recipe) return [];
    const input = strategies.find((strategy) => strategy.id === recipe.inputStrategyId);
    const output = SECTOR_STRATEGIES[lane].find(
      (strategy) => strategy.id === recipe.outputStrategyId
    );
    if (!input || !output) return [];

    const outputSourceRates = Object.fromEntries(
      model.outputProducts.flatMap((commodity) => {
        const rate = output.supply[commodity];
        return typeof rate === "number" && Number.isFinite(rate) && rate > 0
          ? [[commodity, rate]]
          : [];
      })
    ) as Partial<Record<"advertising", number>>;
    const sourceBudget = Object.values(outputSourceRates).reduce(
      (total, rate) => total + (rate ?? 0),
      0
    );
    if (sourceBudget <= 0) return [];
    const outputValueShares = Object.fromEntries(
      Object.entries(outputSourceRates).map(([commodity, rate]) => [
        commodity,
        (rate ?? 0) / sourceBudget,
      ])
    ) as Partial<Record<"advertising", number>>;

    return [
      {
        id: model.id,
        name: model.name,
        description: `${model.name} operating model using established ${recipe.inputStrategyId.replaceAll("_", " ")} inputs.`,
        supply: mediaOperatingModelOutputRates(baseline.supply, outputValueShares),
        demand: { ...input.demand },
        ...(model.technologies[lane] ? { minDecade: model.technologies[lane]?.decade } : {}),
        requiresTechUnlock: Boolean(model.technologies[lane]),
        mediaOperatingModelId: model.id,
      },
    ];
  });
}

/**
 * Look up a strategy by sector type and strategy ID.
 *
 * An unknown ID falls back to the sector's named `standard` recipe, never to
 * `strategies[0]`: several catalogs prepend future recipes, so index 0 can be a
 * locked 2019 recipe and an obsolete persisted ID would silently become one
 * Unknown persisted sector types use an inert strategy until repaired.
 */
function strategyForPreset(
  sectorType: string,
  strategy: SectorStrategy,
  preset?: string
): SectorStrategy {
  const demand =
    strategy.id === "standard" && eraForPreset(preset ?? DEFAULT_SEED_PRESET) === "1991"
      ? DEFAULT_DEMAND_1991[sectorType as OperatingSectorType]
      : undefined;
  return demand ? { ...strategy, demand: { ...demand } } : strategy;
}

export function getStrategy(
  sectorType: string,
  strategyId: string,
  preset?: string,
  options?: StrategyOptions
): SectorStrategy {
  if (!Object.hasOwn(SECTOR_STRATEGIES, sectorType)) return UNKNOWN_SECTOR_STRATEGY;
  const strategies = SECTOR_STRATEGIES[sectorType as OperatingSectorType];
  const strategy =
    strategies.find((s) => s.id === strategyId) ??
    getMediaOperatingModelStrategies(sectorType).find((s) => s.id === strategyId) ??
    strategies.find((s) => s.id === "standard") ??
    UNKNOWN_SECTOR_STRATEGY;
  const resolved = strategyForPreset(sectorType, strategy, preset);
  if (!options?.advertisingInput) return resolved;
  const overlay =
    resolved.id === "standard" && eraForPreset(preset ?? DEFAULT_SEED_PRESET) === "1991"
      ? ADVERTISING_INPUT_STANDARD_1991_DEMAND[sectorType]
      : ADVERTISING_INPUT_VARIANT_DEMAND[sectorType]?.[resolved.id];
  return overlay ? { ...resolved, demand: { ...overlay } } : resolved;
}

/** Strategy options for queries and menus. Model options are omitted unless enabled. */
export function getSectorStrategies(
  sectorType: string,
  mediaOperatingModelsEnabled = false,
  mediaDiscriminator?: string | null,
  preset?: string
): SectorStrategy[] {
  const operatingType = getOperatingSectorType(sectorType, undefined, mediaDiscriminator);
  if (!Object.hasOwn(SECTOR_STRATEGIES, operatingType)) return [];
  const strategies = SECTOR_STRATEGIES[operatingType as OperatingSectorType].map((strategy) =>
    strategyForPreset(operatingType, strategy, preset)
  );
  return mediaOperatingModelsEnabled
    ? [...strategies, ...getMediaOperatingModelStrategies(operatingType)]
    : strategies;
}

/**
 * Resolve the operating lane a persisted sector runs under. Unknown persisted
 * types pass through unchanged so callers can report them.
 */
export function getOperatingSectorType(
  sectorType: OperatingSectorType,
  industryModel?: ManufacturingIndustryModel | string | null,
  mediaDiscriminator?: string | null
): OperatingSectorType;
export function getOperatingSectorType(
  sectorType: string,
  industryModel?: ManufacturingIndustryModel | string | null,
  mediaDiscriminator?: string | null
): string;
export function getOperatingSectorType(
  sectorType: string,
  industryModel?: ManufacturingIndustryModel | string | null,
  mediaDiscriminator?: string | null
): string {
  if (!isCorporationType(sectorType)) return sectorType;
  return operatingSectorTypeFor(sectorType, industryModel, mediaDiscriminator);
}

/**
 * Player-facing label for a persisted sector's operating model. Folded
 * vehicle and entertainment lanes are named for the canonical sector they now
 * belong to, not the retired type.
 */
export function getOperatingSectorLabel(
  sectorType: string,
  industryModel?: string | null,
  mediaDiscriminator?: string | null
): string | null {
  const operating = getOperatingSectorType(sectorType, industryModel, mediaDiscriminator);
  if (operating === "manufacturing_vehicles") return "Vehicle manufacturing";
  if (operating === "media_entertainment") return "Entertainment media";
  return null;
}

/**
 * Resolve a strategy for a persisted sector and its optional manufacturing
 * production model. Vehicle models reuse the unchanged automobile recipes.
 */
export function getStrategyForOperatingModel(
  sectorType: string,
  strategyId: string,
  industryModel?: string | null,
  mediaDiscriminator?: string | null,
  preset?: string
): SectorStrategy {
  return getStrategy(
    getOperatingSectorType(sectorType, industryModel, mediaDiscriminator),
    strategyId,
    preset
  );
}

/**
 * Compute effective supply/demand rates for a sector, handling transitions.
 *
 * During a transition the rates are linearly interpolated between the old
 * and new strategy over STRATEGY_TRANSITION_TURNS turns.
 */
export function getEffectiveStrategyRates(
  sectorType: string,
  strategyId: string,
  transitionFromStrategyId: string | undefined | null,
  transitionStartTurn: number | undefined | null,
  currentTurn: number,
  mediaDiscriminator?: string | null,
  preset?: string,
  hardwareInputReliefStartTurn?: number | null,
  options?: StrategyOptions
): EffectiveStrategyRates {
  const operatingType = getOperatingSectorType(sectorType, undefined, mediaDiscriminator);
  const relieve = (strategy: SectorStrategy): SectorStrategy => {
    const multiplier = hardwareInputMultiplier(
      operatingType,
      strategy.id,
      currentTurn,
      hardwareInputReliefStartTurn
    );
    if (multiplier === 1) return strategy;
    const demand = { ...strategy.demand };
    for (const commodity of Object.keys(demand) as CommodityType[]) {
      demand[commodity] = (demand[commodity] ?? 0) * multiplier;
    }
    return { ...strategy, demand };
  };
  const target = relieve(getStrategy(operatingType, strategyId, preset, options));

  // No transition in progress → return target directly
  if (!transitionFromStrategyId || transitionStartTurn == null) {
    return {
      supply: { ...target.supply },
      demand: { ...target.demand },
      isTransitioning: false,
    };
  }

  const elapsed = currentTurn - transitionStartTurn;
  const progress = Math.min(1, Math.max(0, elapsed / STRATEGY_TRANSITION_TURNS));

  // Transition complete → return target directly
  if (progress >= 1) {
    return {
      supply: { ...target.supply },
      demand: { ...target.demand },
      isTransitioning: false,
    };
  }

  const source = relieve(getStrategy(operatingType, transitionFromStrategyId, preset, options));

  // Interpolate each commodity rate
  const supply = blendRates(source.supply, target.supply, progress);
  const demand = blendRates(source.demand, target.demand, progress);

  return { supply, demand, isTransitioning: true };
}

/** Resolve a strategy transition through the sector's optional production model. */
export function getEffectiveStrategyRatesForOperatingModel(
  sectorType: string,
  strategyId: string,
  transitionFromStrategyId: string | undefined | null,
  transitionStartTurn: number | undefined | null,
  currentTurn: number,
  industryModel?: string | null,
  mediaDiscriminator?: string | null,
  preset?: string,
  hardwareInputReliefStartTurn?: number | null,
  options?: StrategyOptions
): EffectiveStrategyRates {
  return getEffectiveStrategyRates(
    getOperatingSectorType(sectorType, industryModel, mediaDiscriminator),
    strategyId,
    transitionFromStrategyId,
    transitionStartTurn,
    currentTurn,
    mediaDiscriminator,
    preset,
    hardwareInputReliefStartTurn,
    options
  );
}

/** Linearly blend two rate maps. Commodities in either map are included. */
function blendRates(
  from: Partial<Record<CommodityType, number>>,
  to: Partial<Record<CommodityType, number>>,
  progress: number
): Partial<Record<CommodityType, number>> {
  const allKeys = new Set([
    ...(Object.keys(from) as CommodityType[]),
    ...(Object.keys(to) as CommodityType[]),
  ]);
  const result: Partial<Record<CommodityType, number>> = {};
  for (const key of allKeys) {
    const fromVal = from[key] ?? 0;
    const toVal = to[key] ?? 0;
    const blended = fromVal * (1 - progress) + toVal * progress;
    if (blended > 0) {
      result[key] = Math.round(blended * 10000) / 10000;
    }
  }
  return result;
}

/**
 * True only for the news and broadcast media lane. A `media` row with the
 * `entertainment` discriminator runs the entertainment lane's economics, so the
 * media derate never reaches it. The discriminator is a required argument at
 * every call site so the ledger and the clearing offer cannot drift apart.
 */
export function isNewsMediaLane(
  sectorType: string,
  mediaDiscriminator: string | null | undefined
): boolean {
  return getOperatingSectorType(sectorType, undefined, mediaDiscriminator) === "media";
}

/** The derate for one sector: 1 for everything outside the news media lane. */
export function plannedEconomyMediaSupplyFactor(
  sectorType: OperatingSectorType,
  plannedEconomy: boolean,
  mediaDiscriminator: string | null | undefined
): number {
  if (!isNewsMediaLane(sectorType, mediaDiscriminator)) return 1;
  return plannedEconomy ? PLANNED_ECONOMY_MEDIA_SUPPLY_FACTOR : MARKET_ECONOMY_MEDIA_SUPPLY_FACTOR;
}
