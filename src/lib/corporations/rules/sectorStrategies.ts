import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import {
  ADVERTISING_INPUT_STANDARD_1991_DEMAND,
  ADVERTISING_INPUT_VARIANT_DEMAND,
} from "@/lib/constants/sectorStrategyAdvertisingOverlay";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import type { CommodityType } from "@/lib/constants/commodities";
import { hardwareInputMultiplier } from "./hardwareInputRelief";
import {
  MEDIA_OPERATING_MODELS,
  mediaOperatingModelOutputRates,
  type MediaOperatingModelSector,
} from "@/lib/mediaOperatingModels/catalog";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { DEFAULT_DEMAND_1991 } from "@/lib/constants/sectorStrategyDefinitions1991";
import { STANDARD_RETAIL_INPUT_SCALE_2027 } from "@/lib/constants/sectorStrategies/retail";
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

const FOCUSED_MINING_CHEMICAL_DEMAND_2027 = 0.12;
const FOCUSED_MINING_STRATEGIES = new Set(["oil_gas", "natural_gas_drilling", "rare_earth_mining"]);

/**
 * Build the model recipes from existing physical input baskets and output
 * patterns. Output rates retain the default sector's base-value budget; input
 * costs remain on the ordinary strategy demand and physical-cost rails.
 */
export function getMediaOperatingModelStrategies(sectorType: string): SectorStrategy[] {
  if (sectorType !== "media") return [];
  const lane: MediaOperatingModelSector = "media";
  const strategies = SECTOR_STRATEGIES[lane];
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
  preset?: string,
  options?: StrategyOptions
): SectorStrategy {
  const era = eraForPreset(preset ?? DEFAULT_SEED_PRESET);
  const standard1991 = strategy.id === "standard" && era === "1991";
  const eraDemand = standard1991
    ? DEFAULT_DEMAND_1991[sectorType as OperatingSectorType]
    : undefined;
  const overlay = options?.advertisingInput
    ? standard1991
      ? ADVERTISING_INPUT_STANDARD_1991_DEMAND[sectorType]
      : ADVERTISING_INPUT_VARIANT_DEMAND[sectorType]?.[strategy.id]
    : undefined;
  const demand = overlay ?? eraDemand;
  if (era === "2027" && sectorType === "retail" && strategy.id === "standard") {
    const resizedDemand = { ...(demand ?? strategy.demand) };
    for (const commodity of Object.keys(resizedDemand) as CommodityType[]) {
      resizedDemand[commodity] = (resizedDemand[commodity] ?? 0) * STANDARD_RETAIL_INPUT_SCALE_2027;
    }
    return { ...strategy, demand: resizedDemand };
  }
  if (era === "2027" && sectorType === "extraction" && FOCUSED_MINING_STRATEGIES.has(strategy.id)) {
    return {
      ...strategy,
      demand: { ...(demand ?? strategy.demand), chemicals: FOCUSED_MINING_CHEMICAL_DEMAND_2027 },
    };
  }
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
  return strategyForPreset(sectorType, strategy, preset, options);
}

/** Strategy options for queries and menus. Model options are omitted unless enabled. */
export function getSectorStrategies(
  sectorType: string,
  mediaOperatingModelsEnabled = false,
  preset?: string
): SectorStrategy[] {
  if (!Object.hasOwn(SECTOR_STRATEGIES, sectorType)) return [];
  const strategies = SECTOR_STRATEGIES[sectorType as OperatingSectorType].map((strategy) =>
    strategyForPreset(sectorType, strategy, preset)
  );
  return mediaOperatingModelsEnabled
    ? [...strategies, ...getMediaOperatingModelStrategies(sectorType)]
    : strategies;
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
  preset?: string,
  hardwareInputReliefStartTurn?: number | null,
  options?: StrategyOptions
): EffectiveStrategyRates {
  const relieve = (strategy: SectorStrategy): SectorStrategy => {
    const multiplier = hardwareInputMultiplier(
      sectorType,
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
  const target = relieve(getStrategy(sectorType, strategyId, preset, options));

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

  const source = relieve(getStrategy(sectorType, transitionFromStrategyId, preset, options));

  // Interpolate each commodity rate
  const supply = blendRates(source.supply, target.supply, progress);
  const demand = blendRates(source.demand, target.demand, progress);

  return { supply, demand, isTransitioning: true };
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

/** The derate for one sector: 1 for everything outside media. */
export function plannedEconomyMediaSupplyFactor(
  sectorType: OperatingSectorType,
  plannedEconomy: boolean
): number {
  if (sectorType !== "media") return 1;
  return plannedEconomy ? PLANNED_ECONOMY_MEDIA_SUPPLY_FACTOR : MARKET_ECONOMY_MEDIA_SUPPLY_FACTOR;
}
