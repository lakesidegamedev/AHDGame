/**
 * Nominal growth for tax bases and revenue projections.
 *
 * Tax bases and the revenue they produce are nominal: they grow with real output
 * plus the price level, so projecting revenue by real growth alone understates
 * every inflationary year. Deflation floors at zero here, matching the tax-base
 * ceiling. The debt identity keeps it signed instead, because falling prices do
 * shrink nominal GDP. See `nominalGrowthFromReal` in
 * `sovereignDebtSustainability`.
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
