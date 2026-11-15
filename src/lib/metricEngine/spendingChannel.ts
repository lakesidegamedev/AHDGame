/**
 * Spending to metric channel: per-capita spending in a budget category drives
 * a derived outcome with diminishing returns; capital-stock metrics use
 * maintenance-decay so they erode unless investment offsets it.
 *
 * `halfSaturation` and `max` are per-metric calibration inputs; the framework
 * only guarantees the shape: monotonic, concave, bounded. UNITS: `ctx.spending`
 * per-capita values are GDP-normalized onto the US reference scale, so the
 * *_SPEND_HALF_SAT constants keep their US-dollar calibrations for every
 * country.
 */

/**
 * Diminishing-returns response: `max · f / (f + halfSaturation)`. Monotonic
 * increasing, concave, asymptotic to `max` (never reaches it), and `max/2` at
 * `f == halfSaturation`. Non-positive funding → 0.
 */
export function fundingResponse(perCapita: number, halfSaturation = 1, max = 100): number {
  if (!(perCapita > 0)) return 0; // also catches NaN
  return (max * perCapita) / (perCapita + halfSaturation);
}

/** Per-capita spending with a safe divide (non-positive/non-finite population → 0). */
export function perCapitaSpending(categorySpend: number, population: number): number {
  if (!Number.isFinite(population) || population <= 0) return 0;
  return categorySpend / population;
}

/**
 * Maintenance-decay for capital-stock metrics: `max(prev − decay, target)`. The
 * stock erodes by at most `decay` per turn but funding (`target`) holds it up —
 * sustained underfunding visibly degrades it, while adequate funding pins it.
 */
export function maintenanceDecay(prev: number, target: number, decay: number): number {
  return Math.max(prev - decay, target);
}
