/**
 * Price level for nominal GDP.
 *
 * A country's `priceIndex` starts at 1 and compounds by its annual inflation
 * rate each turn. `state.gdp` is nominal: real output times this index, so
 * debt, tax bases and spending (all nominal) are measured against a nominal
 * denominator. Real growth stays the reported growth figure, and the real
 * economy (capital, productivity, output gap, per-capita anchors) runs on
 * `toRealOutput`.
 */

/** Index of a world with no accumulated inflation; also the value when absent. */
export const PRICE_INDEX_BASE = 1;

/** EMA weight on the prior national GDP, per year, when smoothing for budget ratios. */
export const GDP_SMOOTHING_INERTIA = 0.7;

/** Widest believable gap between the smoothed prior and the live level. */
const SMOOTHING_SANITY_BAND = 10;

/** A deflation of more than this per year is clamped, so the index stays positive. */
const MIN_ANNUAL_FACTOR = 0.05;

export function resolvePriceIndex(index: number | undefined | null): number {
  return typeof index === "number" && Number.isFinite(index) && index > 0
    ? index
    : PRICE_INDEX_BASE;
}

/** Per-turn price factor equivalent to an annual inflation rate in percent. */
export function perTurnPriceFactor(annualInflationPct: number, turnsPerYear: number): number {
  const r = Number.isFinite(annualInflationPct) ? annualInflationPct : 0;
  return Math.max(MIN_ANNUAL_FACTOR, 1 + r / 100) ** (1 / turnsPerYear);
}

export function advancePriceIndex(
  prevIndex: number | undefined | null,
  annualInflationPct: number,
  turnsPerYear: number
): number {
  return resolvePriceIndex(prevIndex) * perTurnPriceFactor(annualInflationPct, turnsPerYear);
}

export function toRealOutput(nominal: number, index: number | undefined | null): number {
  return nominal / resolvePriceIndex(index);
}

export function toNominalOutput(real: number, index: number | undefined | null): number {
  return real * resolvePriceIndex(index);
}

/**
 * Per-turn step of the smoothed national GDP, with the same time constant as an
 * annual EMA of `annualInertia`: the per-turn inertia is its `turnsPerYear`-th root.
 * A prior more than `SMOOTHING_SANITY_BAND` times off the current level is a
 * placeholder or a unit mismatch, not smoothing lag, and cold-starts instead.
 */
export function smoothNationalGdpPerTurn(
  prev: number | undefined,
  current: number,
  annualInertia: number,
  turnsPerYear: number
): number {
  if (prev === undefined || !Number.isFinite(prev) || prev <= 0) return current;
  const ratio = prev / current;
  if (ratio > SMOOTHING_SANITY_BAND || ratio < 1 / SMOOTHING_SANITY_BAND) return current;
  const inertia = annualInertia ** (1 / turnsPerYear);
  return inertia * prev + (1 - inertia) * current;
}
