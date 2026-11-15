import {
  commodityMixWeight,
  COMMODITY_BASE_PRICES,
  type CommodityType,
} from "@/lib/constants/commodities";

/**
 * Expansion appetite for one more unit of a sector's output, in sector output
 * units: the rate-weighted MEAN unmet demand across the sector's output legs.
 *
 * Each leg converts to sector units by `commodityMixWeight` (one sector unit
 * splits across the mix), then legs average by supply rate, matching the
 * bot-side `sectorShortageScore` so advisor and NPP brain rank mixed plants
 * consistently.
 *
 * Uses the MEAN, not the MIN, so a mixed plant with one balanced line still
 * answers a deep shortage on another leg rather than quoting zero. Uniformly
 * glutted markets still read ~0, and single-output sectors are byte-identical.
 *
 * `gapForCommodity` supplies unmet demand for one commodity, in commodity
 * units. Callers pass the REACHABLE book gap (`reachableDemandGap`) and fall
 * back to the global aggregate only on worlds with no persisted book.
 */
export function sectorDemandGapUnits(
  supplyMix: Partial<Record<CommodityType, number>>,
  gapForCommodity: (commodity: CommodityType) => number
): number {
  let weightedUnits = 0;
  let totalRate = 0;
  for (const [commodity, rate] of Object.entries(supplyMix) as [CommodityType, number][]) {
    if (!(rate > 0)) continue;
    const weight = commodityMixWeight(supplyMix, COMMODITY_BASE_PRICES, commodity);
    if (!(weight > 0)) continue;
    weightedUnits += rate * (Math.max(0, gapForCommodity(commodity)) / weight);
    totalRate += rate;
  }
  return totalRate > 0 ? weightedUnits / totalRate : 0;
}
