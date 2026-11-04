/**
 * Unowned headroom for local service markets, read from measured demand.
 *
 * Under plants the unowned pool is meant to be unmet demand in capacity units,
 * but nothing refills it from demand. Growth and the yearly auto-seed both
 * multiply it, and founding draws clamp it at zero, so a cell that an
 * incumbent once filled stays at zero for good. Healthcare, real estate and
 * construction sell only in their own state, so a zero pool there closes the
 * state to every new entrant and to autopilot growth, however short the state
 * book reads. Live turn 663: healthcare pools in CA, NY, FL, TX, PA and four
 * Japanese regions were 0 while those state books were 362,722 units short.
 *
 * With `nppStateServiceHeadroomStage` on, the NPP pass reads such a cell's
 * headroom as the larger of the pool and the state book's unmet demand less the
 * capacity already in flight there. The persisted pool is not rewritten; draws
 * still clamp it at zero. Plain data in, plain data out; the NPP shell loads
 * the books and the build queues.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";

/** gameConfig.nppStateServiceHeadroomStage: >= 1 reads local service headroom from the state book. */
export function stateServiceHeadroomOn(stage: number | null | undefined): boolean {
  return (stage ?? 0) >= 1;
}

/**
 * Whether every output a sector sells is a state-scoped service. A mixed
 * sector (logistics sells freight and consulting) is left alone: its reachable
 * leg's gap is national and would be counted again in every state.
 */
export function isStateServiceSupplyMix(
  supplyMix: Partial<Record<CommodityType, number>>
): boolean {
  let legs = 0;
  for (const [commodity, rate] of Object.entries(supplyMix) as [CommodityType, number][]) {
    if (!(rate > 0)) continue;
    if (!isStateScopedCommodity(commodity)) return false;
    legs += 1;
  }
  return legs > 0;
}

/**
 * Headroom the NPP pass should read for one local service cell: the pool, or
 * the state's unmet demand net of capacity already ordered there when that is
 * larger. An unreadable book (null) keeps the pool.
 */
export function stateServiceHeadroomUnits(args: {
  poolUnits: number;
  unmetUnits: number | null;
  inFlightUnits: number;
}): number {
  const pool = Number.isFinite(args.poolUnits) ? Math.max(0, args.poolUnits) : 0;
  if (args.unmetUnits == null || !Number.isFinite(args.unmetUnits)) return pool;
  const inFlight = Number.isFinite(args.inFlightUnits) ? Math.max(0, args.inFlightUnits) : 0;
  return Math.max(pool, Math.max(0, args.unmetUnits) - inFlight);
}
