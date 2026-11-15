import type { OperatingSectorType } from "@/lib/constants/corporations";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import { impliedOutputUnits } from "@/lib/market/capital";

/** Strategy whose supply mix is used when a sector has no strategy of its own. */
const DEFAULT_STRATEGY_ID = "standard";

/**
 * Revenue to implied output units on a specific strategy's supply mix.
 * An absent or unknown strategy resolves to the sector type's standard mix.
 */
export function computeSectorImpliedUnits(
  sectorType: OperatingSectorType,
  revenue: number,
  strategyId: string | null | undefined,
  unitScale: number
): number {
  const strategy = getStrategy(sectorType, strategyId ?? DEFAULT_STRATEGY_ID);
  return impliedOutputUnits(revenue, strategy.supply, COMMODITY_BASE_PRICES, unitScale);
}
