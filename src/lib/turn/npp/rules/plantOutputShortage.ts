/**
 * Shortage score of the goods a plant actually sells.
 *
 * The sector tables weight every extraction plant as a broad-mix mine (iron,
 * coal, oil, rare earth, gas and timber). A mine running a focused recipe sells
 * only that recipe's outputs, so scoring it on the broad mix let a coal or rare
 * earth shortage pay for new oil and gas wells while crude sat at the price
 * floor. Extraction plants with a known non-standard recipe are scored on the
 * recipe's own outputs; every other plant keeps its sector table.
 *
 * Pure: sector type, recipe id and a price-ratio function in, a score out.
 */
import { SECTOR_SUPPLY, type CommodityType } from "@/lib/constants/commodities";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategyDefinitions";

export interface OutputFlow {
  commodity: CommodityType;
  rate: number;
}

/** currentPrice/basePrice for a commodity in a country, or null when unpriced. */
export type OutputPriceRatioFn = (commodity: CommodityType, countryId: string) => number | null;

/** The outputs a plant sells, with their supply rates. */
export function plantOutputFlows(
  sectorType: string,
  strategyId: string | null | undefined
): readonly OutputFlow[] {
  if (sectorType === "extraction" && strategyId && strategyId !== "standard") {
    const recipe = SECTOR_STRATEGIES.extraction.find((s) => s.id === strategyId);
    const flows: OutputFlow[] = [];
    for (const [commodity, rate] of Object.entries(recipe?.supply ?? {})) {
      if (typeof rate === "number" && rate > 0) {
        flows.push({ commodity: commodity as CommodityType, rate });
      }
    }
    if (flows.length > 0) return flows;
  }
  return SECTOR_SUPPLY[sectorType as OperatingSectorType] ?? [];
}

/** Supply-rate-weighted price ratio over the flows; 1 when none is priced. */
export function weightedOutputShortage(
  flows: readonly OutputFlow[],
  countryId: string,
  priceRatioOf: OutputPriceRatioFn
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const { commodity, rate } of flows) {
    const ratio = priceRatioOf(commodity, countryId);
    if (ratio == null || !Number.isFinite(ratio)) continue;
    weighted += rate * ratio;
    totalWeight += rate;
  }
  return totalWeight > 0 ? weighted / totalWeight : 1;
}

/** Highest price ratio among the flows; 0 when none is priced. */
export function peakOutputShortage(
  flows: readonly OutputFlow[],
  countryId: string,
  priceRatioOf: OutputPriceRatioFn
): number {
  let peak = 0;
  for (const { commodity } of flows) {
    const ratio = priceRatioOf(commodity, countryId);
    if (ratio != null && Number.isFinite(ratio) && ratio > peak) peak = ratio;
  }
  return peak;
}
