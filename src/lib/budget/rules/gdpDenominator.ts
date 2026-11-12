/**
 * GDP denominators for the fiscal surfaces, in base currency units (not millions).
 * `liveNationalGdpUnits` is the displayed nominal level; `resolveRatioGdp` is the
 * smoothed basis for debt and deficit ratios.
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
