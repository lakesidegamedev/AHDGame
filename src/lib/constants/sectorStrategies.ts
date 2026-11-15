/**
 * Sector strategies a corporation can pick, and what switching costs. Each sector
 * type has 4 to 8 strategies in SECTOR_STRATEGIES that change which commodities it
 * consumes and produces; margin follows the commodity market, not the strategy.
 * Switching charges 25% of daily revenue, phases in over 12 turns with a -5 point
 * margin penalty, and locks further changes for 24 turns (getEffectiveStrategyRates).
 *
 * The tables live in sectorStrategiesTables and the formulas in
 * corporations/rules/sectorStrategies. This module forwards both and keeps the
 * telemetry for unknown persisted sector types, which the rules zone cannot hold.
 */

import * as Sentry from "@sentry/nextjs";
import {
  getEffectiveStrategyRates as getEffectiveStrategyRatesRule,
  getEffectiveStrategyRatesForOperatingModel as getEffectiveStrategyRatesForOperatingModelRule,
  getOperatingSectorType,
  getStrategy as getStrategyRule,
  getStrategyForOperatingModel as getStrategyForOperatingModelRule,
} from "@/lib/corporations/rules/sectorStrategies";
import {
  SECTOR_STRATEGIES,
  type EffectiveStrategyRates,
  type SectorStrategy,
  type StrategyOptions,
} from "./sectorStrategiesTables";

export * from "./sectorStrategiesTables";
export {
  getMediaOperatingModelStrategies,
  getSectorStrategies,
  getOperatingSectorType,
  getOperatingSectorLabel,
  isNewsMediaLane,
  plannedEconomyMediaSupplyFactor,
} from "@/lib/corporations/rules/sectorStrategies";

const reportedUnknownSectorTypes = new Set<string>();

function reportUnknownSectorType(sectorType: string): void {
  if (Object.hasOwn(SECTOR_STRATEGIES, sectorType)) return;
  if (reportedUnknownSectorTypes.has(sectorType)) return;
  reportedUnknownSectorTypes.add(sectorType);
  Sentry.captureMessage("Unknown persisted sector type: using inert strategy", {
    level: "error",
    extra: { sectorType },
  });
}

export function getStrategy(
  sectorType: string,
  strategyId: string,
  preset?: string,
  options?: StrategyOptions
): SectorStrategy {
  reportUnknownSectorType(sectorType);
  return getStrategyRule(sectorType, strategyId, preset, options);
}

export function getStrategyForOperatingModel(
  sectorType: string,
  strategyId: string,
  industryModel?: string | null,
  mediaDiscriminator?: string | null,
  preset?: string
): SectorStrategy {
  reportUnknownSectorType(getOperatingSectorType(sectorType, industryModel, mediaDiscriminator));
  return getStrategyForOperatingModelRule(
    sectorType,
    strategyId,
    industryModel,
    mediaDiscriminator,
    preset
  );
}

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
  reportUnknownSectorType(getOperatingSectorType(sectorType, undefined, mediaDiscriminator));
  return getEffectiveStrategyRatesRule(
    sectorType,
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
  reportUnknownSectorType(getOperatingSectorType(sectorType, industryModel, mediaDiscriminator));
  return getEffectiveStrategyRatesForOperatingModelRule(
    sectorType,
    strategyId,
    transitionFromStrategyId,
    transitionStartTurn,
    currentTurn,
    industryModel,
    mediaDiscriminator,
    preset,
    hardwareInputReliefStartTurn,
    options
  );
}
