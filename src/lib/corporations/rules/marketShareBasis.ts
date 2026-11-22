/*
 * Market size and market share are measured on earned revenue (`realizedRevenue`),
 * the figure every other screen shows. One measure feeds the market total, a
 * company's share, competitor rows and the dominance mechanic, so they agree.
 */

interface ShareRevenueFacts {
  revenue?: number;
  realizedRevenue?: number;
  capitalStock?: number;
  plantCount?: number;
}

/**
 * Revenue that counts toward market share, in the sector's host currency. A
 * sector with no delivered capacity yet (a founding sector inside its build
 * window) carries a nameplate figure nothing has earned, so it claims no
 * share. An earned figure falls back to nameplate revenue for a row not yet settled.
 */
export function shareRevenueOf(sector: ShareRevenueFacts): number {
  if (sector.capitalStock === 0 && !((sector.plantCount ?? 0) > 0)) return 0;
  if (typeof sector.realizedRevenue === "number") {
    return sector.realizedRevenue;
  }
  return sector.revenue ?? 0;
}
