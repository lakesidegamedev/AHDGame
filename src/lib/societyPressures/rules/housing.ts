/**
 * Minimal housing pressure for the 2027 world. Not a housing market: one
 * stock of homes per region against the households that need them.
 *
 * Households are adults over the average number of adults per household.
 * The stock opens equal to the households it houses, wears out slowly and
 * grows with construction (the region's housing supply growth reading),
 * scaled by how effectively zoning lets planned homes get built. Pressure is
 * households per home as an index (100 = every household housed); above 100
 * it raises the cost of living.
 */

/** Adults per household by country (game design, not census data). */
export const ADULTS_PER_HOUSEHOLD: Readonly<Record<string, number>> = {
  US: 1.9,
  UK: 1.85,
  DE: 1.7,
  JP: 1.8,
  CN: 2.3,
};
export const DEFAULT_ADULTS_PER_HOUSEHOLD = 1.9;

/** Share of the housing stock lost to demolition and decay each year. */
export const HOUSING_DEPRECIATION_PER_YEAR = 0.005;
/** Cost of living index points per point of pressure above 100. */
export const COST_OF_LIVING_PER_PRESSURE_POINT = 0.5;
export const COST_OF_LIVING_NUDGE_BOUNDS = [-5, 15] as const;
export const HOUSING_PRESSURE_BOUNDS = [50, 200] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const finiteOr = (v: number | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function households(adults: number, countryId: string): number {
  const size = ADULTS_PER_HOUSEHOLD[countryId] ?? DEFAULT_ADULTS_PER_HOUSEHOLD;
  return Math.max(0, finiteOr(adults, 0)) / size;
}

/**
 * Next housing stock. With no previous stock the region opens balanced.
 * `supplyGrowthPct` is annual construction as a percent of the stock.
 */
export function advanceHousingStock(input: {
  previousStock: number | undefined;
  households: number;
  supplyGrowthPct: number | undefined;
  zoningEffectiveness: number;
  turnsPerYear: number;
}): number {
  const previous = input.previousStock;
  if (!(typeof previous === "number" && Number.isFinite(previous) && previous > 0)) {
    return Math.max(1, input.households);
  }
  const construction =
    (Math.max(0, finiteOr(input.supplyGrowthPct, 1)) / 100) *
    Math.max(0, finiteOr(input.zoningEffectiveness, 1));
  const net = (construction - HOUSING_DEPRECIATION_PER_YEAR) / Math.max(1, input.turnsPerYear);
  return Math.max(1, previous * (1 + net));
}

/** Households per home as an index, 100 = balanced. */
export function housingPressureIndex(householdCount: number, stock: number): number {
  if (!(stock > 0)) return 100;
  return clamp((100 * Math.max(0, householdCount)) / stock, ...HOUSING_PRESSURE_BOUNDS);
}

/** Cost of living target shift from housing pressure. */
export function housingCostOfLivingNudge(pressure: number): number {
  return clamp(
    (finiteOr(pressure, 100) - 100) * COST_OF_LIVING_PER_PRESSURE_POINT,
    ...COST_OF_LIVING_NUDGE_BOUNDS
  );
}
