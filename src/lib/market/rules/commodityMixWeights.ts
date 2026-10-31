/**
 * One sector's output mix weights, computed once per sector.
 *
 * `commodityMixWeight` recomputes the mix's rate/base total on every call, so a
 * caller that splits a scalar output figure across the whole output mix paid
 * O(commodities^2) per sector. The keys and the accumulation order are exactly
 * the ones `commodityMixWeight` uses, so every weight here is bit-identical to
 * the per-commodity call it replaces.
 */
import type { CommodityType } from "@/lib/constants/commodities";

export function commodityMixWeights(
  supplyRates: Partial<Record<CommodityType, number>>,
  basePrices: Record<CommodityType, number>
): Map<CommodityType, number> {
  const weights = new Map<CommodityType, number>();
  const commodities = Object.keys(supplyRates) as CommodityType[];
  let total = 0;
  for (const commodity of commodities) {
    const rate = supplyRates[commodity] ?? 0;
    const base = basePrices[commodity];
    if (rate > 0 && base > 0) total += rate / base;
  }
  if (!(total > 0)) return weights;
  for (const commodity of commodities) {
    const base = basePrices[commodity];
    const rate = supplyRates[commodity] ?? 0;
    if (!(base > 0) || rate <= 0) continue;
    weights.set(commodity, rate / base / total);
  }
  return weights;
}

/** A commodity's weight in a table built by {@link commodityMixWeights}. */
export function mixWeightFor(
  weights: ReadonlyMap<CommodityType, number>,
  commodity: CommodityType
): number {
  return weights.get(commodity) ?? 0;
}
