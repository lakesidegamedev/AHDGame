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
 * Rules only: plain data in, plain data out. The shell loads documents and
 * demand, this module prices them.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_BASE_PRICES, commodityMixWeight } from "@/lib/constants/commodities";
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

/**
 * Worst potential/demand ratio over `commodities` (the commodities the
 * building sector makes). Potential output of a commodity is the firm's owned
 * operating capacity plus every queued unit, across all its sectors, converted
 * to commodity units through the same chain production uses; `extraUnits` of
 * new capacity are added to `targetSectorId` so one oversized order cannot slip
 * under the ramp. Commodities with no known positive demand are skipped.
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
  targetSectorId: string;
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
    const demand = args.demandOf(commodity);
    if (typeof demand !== "number" || !Number.isFinite(demand) || !(demand > 0)) continue;
    let potential = 0;
    for (let index = 0; index < withQueue.length; index += 1) {
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
    const ratio = potential / demand;
    if (ratio > worst.ratio) worst = { ratio, commodity };
  }
  return worst;
}
