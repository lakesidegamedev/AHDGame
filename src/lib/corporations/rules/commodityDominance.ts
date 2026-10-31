/**
 * Commodity-level dominance: the build toll and the dumping guard.
 *
 * The per-(state, sectorType) dominance toll in `corporations.ts` measures
 * share of a local headroom pool, discounted by rival density. A conglomerate
 * can sit at a tiny local share of one cell while owning several times the
 * whole world's demand for a commodity, and pays an affordable surcharge to
 * keep building. This module measures the other thing: a firm's potential
 * output of a commodity (owned operating capacity plus queued builds, in
 * commodity units) over what the world actually wants of it.
 *
 * Freight and the local services sell only in the state that makes them, so
 * for those the market is the target sector's state: the firm's capacity in
 * that state over that state's demand. Measuring them against the world let a
 * firm's idle trucks in another country price a build in a starved state.
 *
 * Rules only: plain data in, plain data out. The shell loads documents and
 * demand, this module prices them.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_BASE_PRICES, commodityMixWeight } from "@/lib/constants/commodities";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import {
  supplierCommoditySupplyMix,
  supplierScaledCapacityUnits,
  type SupplyAgreementCapacitySector,
} from "@/lib/corporations/supplyAgreementCapacity";

export * from "@/lib/corporations/rules/commodityDominanceRamp";

/** A firm's sector for dominance purposes: capacity inputs plus its queue. */
export type CommodityDominanceSector = SupplyAgreementCapacitySector & {
  _id?: { toString(): string } | string | null;
  /** Capacity units still under construction (queued, not yet delivered). */
  queuedUnits?: number | null;
};

export interface CommodityDominanceResult {
  /** Worst potential-output / world-demand ratio across the target's commodities. */
  ratio: number;
  /** The commodity that set the ratio, or null when nothing was measurable. */
  commodity: CommodityType | null;
}

/** The market one commodity's dominance is measured in. */
export interface CommodityDominanceMarket {
  /** Demand of that market (units/day). */
  demand: number;
  /** State the market is confined to, or null for the world. */
  stateId: string | null;
}

/**
 * Market for `commodity` when the firm builds in `targetStateId`. A commodity
 * that sells only where it is made is measured against the target state's
 * demand when that is known; everything else, and a state-scoped commodity
 * with no state reading, falls back to world demand. Null when the chosen
 * market has no positive demand, which the toll treats as unmeasurable.
 */
export function commodityDominanceMarket(args: {
  commodity: CommodityType;
  targetStateId?: string | null;
  worldDemand: number | null | undefined;
  stateDemand?: number | null | undefined;
}): CommodityDominanceMarket | null {
  const stateId = args.targetStateId ? String(args.targetStateId) : null;
  const local =
    stateId != null &&
    isStateScopedCommodity(args.commodity) &&
    typeof args.stateDemand === "number" &&
    Number.isFinite(args.stateDemand);
  const demand = local ? args.stateDemand : args.worldDemand;
  if (typeof demand !== "number" || !Number.isFinite(demand) || !(demand > 0)) return null;
  return { demand, stateId: local ? stateId : null };
}

/** True when `sector` sells into `market` (any sector for a world market). */
export function sectorInDominanceMarket(
  sector: Pick<CommodityDominanceSector, "stateId">,
  market: CommodityDominanceMarket
): boolean {
  return market.stateId == null || String(sector.stateId ?? "") === market.stateId;
}

/**
 * Per-sector supply-mix memo for {@link commodityDominanceRatio}. One decision
 * prices the toll for every sector a corp might build on, and the recipe
 * behind each term does not change across those calls; resolving it per call
 * made the toll quadratic with a strategy lookup in every term.
 */
export function memoSupplyMixOf(
  turn: number
): (sector: CommodityDominanceSector) => Partial<Record<CommodityType, number>> {
  const mixes = new WeakMap<CommodityDominanceSector, Partial<Record<CommodityType, number>>>();
  return (sector) => {
    const cached = mixes.get(sector);
    if (cached) return cached;
    const mix = supplierCommoditySupplyMix(sector, turn);
    mixes.set(sector, mix);
    return mix;
  };
}

/**
 * Worst potential/demand ratio over `commodities` (the commodities the
 * building sector makes). Potential output of a commodity is the firm's owned
 * operating capacity plus every queued unit, across all its sectors, converted
 * to commodity units through the same chain production uses; `extraUnits` of
 * new capacity are added to `targetSectorId` so one oversized order cannot slip
 * under the ramp. Commodities with no known positive demand are skipped.
 * State-scoped commodities read `stateDemandOf` for `targetStateId` and count
 * only capacity in that state (see {@link commodityDominanceMarket}).
 *
 * `supplyMixOf` is a per-sector mix memo owned by the caller. One decision
 * prices this ratio for every sector it might build on, and the mix depends only
 * on the sector and the turn, so resolving it per call made the toll quadratic
 * in the corp's sector count with a full strategy lookup in every term.
 */
export function commodityDominanceRatio(args: {
  sectors: readonly CommodityDominanceSector[];
  commodities: readonly CommodityType[];
  demandOf: (commodity: CommodityType) => number | null | undefined;
  stateDemandOf?: (commodity: CommodityType, stateId: string) => number | null | undefined;
  targetSectorId: string;
  targetStateId?: string | null;
  extraUnits: number;
  isNatcorp: boolean;
  turn: number;
  currentYear?: number | null;
  commandEconomyEnabled?: boolean | null;
  supplyMixOf?: (sector: CommodityDominanceSector) => Partial<Record<CommodityType, number>>;
}): CommodityDominanceResult {
  const extra = Number.isFinite(args.extraUnits) ? Math.max(0, args.extraUnits) : 0;
  const withQueue: SupplyAgreementCapacitySector[] = args.sectors.map((s) => {
    const queued = Number.isFinite(s.queuedUnits) ? Math.max(0, s.queuedUnits as number) : 0;
    const isTarget = s._id != null && String(s._id) === args.targetSectorId;
    return { ...s, capitalStock: (s.capitalStock ?? 0) + queued + (isTarget ? extra : 0) };
  });
  const mixes = new Map<number, Partial<Record<CommodityType, number>>>();
  const supplyMixAt = (index: number): Partial<Record<CommodityType, number>> => {
    const cached = mixes.get(index);
    if (cached) return cached;
    const source = args.sectors[index];
    const mix = args.supplyMixOf
      ? args.supplyMixOf(source)
      : supplierCommoditySupplyMix(source, args.turn);
    mixes.set(index, mix);
    return mix;
  };
  let worst: CommodityDominanceResult = { ratio: 0, commodity: null };
  for (const commodity of args.commodities) {
    const targetStateId = args.targetStateId ? String(args.targetStateId) : null;
    const market = commodityDominanceMarket({
      commodity,
      targetStateId,
      worldDemand: args.demandOf(commodity),
      stateDemand:
        targetStateId && args.stateDemandOf
          ? args.stateDemandOf(commodity, targetStateId)
          : undefined,
    });
    if (!market) continue;
    let potential = 0;
    for (let index = 0; index < withQueue.length; index += 1) {
      if (!sectorInDominanceMarket(withQueue[index], market)) continue;
      const scaled = supplierScaledCapacityUnits({
        sector: withQueue[index],
        isNatcorp: args.isNatcorp,
        turn: args.turn,
        currentYear: args.currentYear,
        commandEconomyEnabled: args.commandEconomyEnabled,
      });
      if (!(scaled > 0)) continue;
      potential +=
        scaled * commodityMixWeight(supplyMixAt(index), COMMODITY_BASE_PRICES, commodity);
    }
    const ratio = potential / market.demand;
    if (ratio > worst.ratio) worst = { ratio, commodity };
  }
  return worst;
}
