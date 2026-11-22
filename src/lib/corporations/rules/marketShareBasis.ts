/**
 * Which revenue figure market size and market share are measured on.
 *
 * "capacity" is the persisted nameplate `revenue` restated from owned capacity.
 * "earned" is what the sector actually booked last turn (`realizedRevenue`),
 * the figure every other screen shows. One basis feeds the market total, a
 * company's share, competitor rows and the dominance mechanic, so they agree.
 */
export type MarketShareBasis = "capacity" | "earned";

/** gameConfig.marketShareEarnedStage: >= 1 measures share on earned revenue. */
export function marketShareBasisFromStage(stage: number | null | undefined): MarketShareBasis {
  return typeof stage === "number" && stage >= 1 ? "earned" : "capacity";
}

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
 * share. Earned falls back to capacity for a row not yet settled.
 */
export function shareRevenueOf(
  sector: ShareRevenueFacts,
  basis: MarketShareBasis = "capacity"
): number {
  if (sector.capitalStock === 0 && !((sector.plantCount ?? 0) > 0)) return 0;
  if (basis === "earned" && typeof sector.realizedRevenue === "number") {
    return sector.realizedRevenue;
  }
  return sector.revenue ?? 0;
}
