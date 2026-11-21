/**
 * When the debt ceiling binds on the current path.
 *
 * The projection is only actionable if it says the year the limit is reached,
 * not just that the ratio rises. This walks the same projected ratios the card
 * draws, converts each to a debt stock at that year's GDP, and compares it with
 * the effective borrowing limit the annual ceiling check uses.
 *
 * Pure rules: projected ratios and budget figures in, a year or a verdict out.
 */

import type { CountryId } from "@/lib/constants/countries";
import { effectiveBorrowingLimit } from "@/lib/budget/borrowingLimit";

export interface CeilingPathPoint {
  year: number;
  debtToGdp: number;
}

export type CeilingBinding =
  /** Already above the limit today. */
  | { kind: "already" }
  /** Limit is crossed in this many years from now. */
  | { kind: "within"; year: number }
  /** Projected horizon ends below the limit. */
  | { kind: "beyond" }
  /** No usable ceiling stored, or no GDP to measure against. */
  | { kind: "none" };

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function debtCeilingBindingYear(input: {
  points: readonly CeilingPathPoint[];
  /** GDP on the ratio's basis, current year. */
  gdp: number;
  /** Current debt stock, same currency as the ceiling. */
  debtPrincipal: number;
  storedCeiling: number;
  countryId: CountryId | string;
  /** Real growth, so the limit scales with the engine's GDP series. */
  realGrowthPct: number;
}): CeilingBinding {
  const storedCeiling = finiteOr(input.storedCeiling, 0);
  const gdp = finiteOr(input.gdp, 0);
  if (storedCeiling <= 0 || gdp <= 0) return { kind: "none" };

  const growth = 1 + finiteOr(input.realGrowthPct, 0) / 100;
  const gdpAt = (year: number) => (growth > 0 ? gdp * Math.pow(growth, year) : gdp);

  const currentLimit = effectiveBorrowingLimit({
    countryId: input.countryId,
    gdp,
    storedCeiling,
  });
  if (finiteOr(input.debtPrincipal, 0) > currentLimit) return { kind: "already" };

  for (const point of input.points) {
    if (point.year <= 0) continue;
    const projectedGdp = gdpAt(point.year);
    const projectedDebt = Math.max(0, finiteOr(point.debtToGdp, 0)) * projectedGdp;
    const limit = effectiveBorrowingLimit({
      countryId: input.countryId,
      gdp: projectedGdp,
      storedCeiling,
    });
    if (projectedDebt > limit) return { kind: "within", year: point.year };
  }

  return { kind: "beyond" };
}
