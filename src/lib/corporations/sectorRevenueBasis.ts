import type { CorporateSector } from "@/lib/db/types";

/**
 * The revenue figure valuation/NPV math should use for a sector, in the sector's
 * home currency.
 *
 * Prefers the persisted per-sector `realizedRevenue` (nameplate after every
 * realization leg: production policy, capacity haircut, clearing/soldFraction,
 * throughput, capital utilization, strike, embargo) that the turn processor
 * writes, falling back to raw nameplate `revenue` for sectors not yet
 * reprocessed. Keeping every "what is this sector/corp worth" surface on the
 * same basis avoids some using nameplate and overstating.
 */
export function sectorEconomicRevenue(
  sector: Pick<CorporateSector, "revenue" | "realizedRevenue">
): number {
  return typeof sector.realizedRevenue === "number"
    ? sector.realizedRevenue
    : (sector.revenue ?? 0);
}
