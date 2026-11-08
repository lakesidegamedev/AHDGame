/**
 * Unowned headroom for local service markets, read from measured demand.
 *
 * The persisted pool can sit at zero permanently (founding draws clamp it,
 * nothing refills it from demand), which closes a state to new entrants
 * however short the state book reads. When the stage flag is on, headroom
 * is the larger of the pool and the state book's unmet demand less capacity
 * already in flight. The persisted pool is not rewritten.
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
