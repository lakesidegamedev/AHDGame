import type { Financials } from "./types";

const TURNS_PER_PERIOD = 24;

/**
 * Revenue per turn as the sector overview states it: the settled site statement
 * first, then realized revenue, and the nameplate figure only as a last resort.
 */
export function settledSectorRevenuePerTurn(
  financials: Pick<Financials, "siteStatement" | "realizedRevenue" | "revenue">
): number {
  return Math.round(
    (financials.siteStatement?.revenue ?? financials.realizedRevenue ?? financials.revenue) /
      TURNS_PER_PERIOD
  );
}
