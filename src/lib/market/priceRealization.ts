import type { CommodityType } from "@/lib/constants/commodities";

// Realized revenue scales with the lagged market price of the sector's
// output, so shortages reward producers and gluts punish them. Guards against
// cobweb oscillation: exponent dampens the response (sqrt of ratio), the
// clamp bounds realization to [MIN, MAX] of base, and prices are lagged one
// turn upstream so price/revenue/supply cannot chase each other circularly.
const PRICE_REALIZATION_EXPONENT = 0.5;
export const PRICE_REALIZATION_MIN = 0.7;
export const PRICE_REALIZATION_MAX = 2.0;

/**
 * Output-weighted realization factor for one sector.
 *
 * For each commodity the sector produces (rate > 0), the per-commodity factor
 * is `clamp((price/base)^EXPONENT, MIN, MAX)`; the sector factor is the
 * supply-rate-weighted mean. Commodities missing from the price map (or with
 * non-finite/non-positive ratios) are treated as priced at base (factor 1),
 * so a missing price can never move revenue. Returns exactly 1 when the
 * sector has no positive supply rates.
 */
/**
 * Per-commodity realization factor for one price-over-base ratio:
 * `clamp(ratio^EXPONENT, MIN, MAX)`. Degenerate ratios (missing, non-finite,
 * <= 0) are treated as priced at base. Shared by the turn engine and the
 * sector-detail UI so the two can never diverge.
 */
export function priceRealizationFactor(ratio: number | undefined | null): number {
  const safeRatio = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return Math.min(
    PRICE_REALIZATION_MAX,
    Math.max(PRICE_REALIZATION_MIN, Math.pow(safeRatio, PRICE_REALIZATION_EXPONENT))
  );
}

export function computePriceRealization(
  supplyRates: Partial<Record<CommodityType, number>>,
  priceRatioByCommodity: ReadonlyMap<CommodityType, number>
): number {
  if (!supplyRates) return 1;
  let rateSum = 0;
  let weighted = 0;
  for (const commodity of Object.keys(supplyRates) as CommodityType[]) {
    const rate = supplyRates[commodity] ?? 0;
    if (rate <= 0) continue;
    const factor = priceRealizationFactor(priceRatioByCommodity.get(commodity));
    rateSum += rate;
    weighted += rate * factor;
  }
  if (rateSum <= 0) return 1;
  return weighted / rateSum;
}
