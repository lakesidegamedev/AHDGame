import type { CommodityType } from "@/lib/constants/commodities";

/**
 * Era-aware correction for commodity demand generators.
 *
 * Demand generators convert MONEY into demand UNITS as
 * `units = budgetAnchor * RATE / basePrice`. Because base prices are
 * era-scaled and sit in the DENOMINATOR, the conversion drifts wildly across
 * eras even though RATE constants were calibrated against one era's price.
 * Uncorrected, a 1953 world measures advertising supply/demand near 0.03;
 * correcting globally would break the era the constant was calibrated for,
 * hence a table keyed by era, inert by default.
 *
 * Values are the reciprocal of the measured supply/demand ratio, targeting
 * ~0.9 (slightly supply-short so scarcity still has meaning). Only eras with
 * measured flow data are present; every other era resolves to 1.0 and is
 * byte-identical to today.
 */
export const COMMODITY_DEMAND_CALIBRATION: Record<
  string,
  Partial<Record<CommodityType, number>>
> = {
  "1953": {
    // Values back-solved to a ~0.9 supply/demand target: mult = mult_old *
    // (supply / 0.9) / demand. Earlier soak-sized cuts overshot into gluts that
    // pinned prices at the floor.
    advertising: 0.44,
    natural_gas: 0.74,
    healthcare_services: 0.92,
    // Live S/D 1.47 / 1.20 / 0.99 — inside the healthy band, left at the
    // soak-derived values. Iron is a mild glut (price 0.77); revisit if it
    // drifts further down.
    iron: 0.45,
    oil: 0.55,
    energy: 0.55,
  },
};

/**
 * Demand multiplier for one commodity in one era. Returns 1 for every era and
 * commodity without an authored correction, so callers multiply unconditionally.
 */
export function commodityDemandCalibration(
  era: string | null | undefined,
  commodity: CommodityType
): number {
  if (!era) return 1;
  return COMMODITY_DEMAND_CALIBRATION[era]?.[commodity] ?? 1;
}
