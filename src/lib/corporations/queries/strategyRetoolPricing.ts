/**
 * Per-strategy retool fee for the strategy picker. Converting off a retired
 * (sunset) method onto one of its named successors is discounted with the same
 * multiplier the retool command charges.
 */
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { SectorStrategy } from "@/lib/constants/sectorStrategies";
import { STRATEGY_RETOOL_COST_FRACTION } from "@/lib/constants/sectorStrategies";
import { sunsetRetoolCostMultiplier } from "@/lib/constants/techTree";
import type { CorporateSector } from "@/lib/db/types";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";

export interface StrategyRetoolPricingInput {
  sector: Pick<CorporateSector, "strategyId" | "revenue">;
  sectorHostLiquidCode: CurrencyCode | undefined;
  sectorHostFxRate: number;
  techTreesEnabled: boolean;
  techCurrentYear: number;
}

export function strategyRetoolPricing(
  input: StrategyRetoolPricingInput,
  strategies: readonly SectorStrategy[],
  toStrategyId: string
): { retoolCostMultiplier: number; retoolCost: number } {
  const current = strategies.find((s) => s.id === (input.sector.strategyId ?? "standard"));
  const retoolCostMultiplier = input.techTreesEnabled
    ? sunsetRetoolCostMultiplier(current, toStrategyId, input.techCurrentYear)
    : 1;
  const baseRetoolCost =
    readCorpEconomicAnchor(
      input.sector.revenue,
      input.sectorHostLiquidCode,
      input.sectorHostFxRate
    ) * STRATEGY_RETOOL_COST_FRACTION;
  return {
    retoolCostMultiplier,
    retoolCost: Math.round(baseRetoolCost * retoolCostMultiplier),
  };
}
