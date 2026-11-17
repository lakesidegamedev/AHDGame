/**
 * Nominal growth for tax bases and revenue projections.
 *
 * Tax bases and the revenue they produce are nominal quantities: they grow with
 * real output plus the price level. `economicFactors.gdpGrowth` is real, so
 * projecting revenue by it alone understates every year inflation is positive,
 * and a projection that also grows spending by inflation then reports a deficit
 * the tax code would not produce.
 *
 * Deflation floors at zero here, matching the tax-base ceiling: a deflationary
 * year must not cut a base. That floor is deliberately absent from the debt
 * identity, where falling prices do shrink nominal GDP. See
 * `nominalGrowthFromReal` in `sovereignDebtSustainability`.
 */

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Real growth plus positive inflation, as a percentage. */
export function nominalTaxBaseGrowthPct(
  realGrowthPct: number | null | undefined,
  inflationPct: number | null | undefined
): number {
  return finiteOr(realGrowthPct, 0) + Math.max(0, finiteOr(inflationPct, 0));
}
