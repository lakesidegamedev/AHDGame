/**
 * GDP denominators for the fiscal surfaces.
 *
 * Two different numbers, deliberately:
 *
 *   liveNationalGdpUnits  the LEVEL to display. `state.gdp` is the A1 SSOT
 *                         (db/types/budget.ts), NOMINAL (real output times the
 *                         country's price index), and moves every turn.
 *
 *   resolveRatioGdp       the BASIS for debt-to-GDP and deficit-to-GDP, and
 *                         for every other budget reader. The metric engine
 *                         refreshes `federalBudget.gdp` and `gdpSmoothed` to the
 *                         same smoothed nominal level each turn, so a one-period
 *                         swing cannot move a solvency ratio and no reader sees
 *                         a stale fiscal-close snapshot.
 *
 * Both are in base currency UNITS, not millions.
 */
export function resolveRatioGdp(budget: { gdp?: number; gdpSmoothed?: number }): number {
  const smoothed = budget.gdpSmoothed;
  if (typeof smoothed === "number" && Number.isFinite(smoothed) && smoothed > 0) return smoothed;
  const raw = budget.gdp;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** Sum of regional GDP (stored in millions) expressed in base currency units. */
export function liveNationalGdpUnits(states: { gdp?: number }[]): number {
  return (
    states.reduce(
      (sum, s) => sum + (typeof s.gdp === "number" && Number.isFinite(s.gdp) ? s.gdp : 0),
      0
    ) * 1_000_000
  );
}

/**
 * A flow-to-GDP ratio on the same basis as the stored debt ratio, as a fraction.
 * Null when no usable denominator exists, so callers show nothing rather than a
 * ratio against zero.
 */
export function flowToRatioGdp(
  flow: number | undefined,
  budget: { gdp?: number; gdpSmoothed?: number }
): number | null {
  const denominator = resolveRatioGdp(budget);
  if (denominator <= 0) return null;
  return (typeof flow === "number" && Number.isFinite(flow) ? flow : 0) / denominator;
}

/**
 * Annualised growth in percent implied by two successive GDP levels one turn
 * apart; the exact inverse of `compoundGdpLevel`. Null when either level is
 * unusable.
 */
export function impliedAnnualGrowthPct(
  prevGdp: number,
  nextGdp: number,
  turnsPerYear: number
): number | null {
  if (!(prevGdp > 0) || !(nextGdp > 0) || !Number.isFinite(prevGdp) || !Number.isFinite(nextGdp))
    return null;
  return ((nextGdp / prevGdp) ** turnsPerYear - 1) * 100;
}
