import type { CommodityPriceAttribution } from "./priceAttribution";

/** Parts must rebuild the applied price this closely before the target is trusted. */
const RECONCILE_TOLERANCE = 0.01;

export interface CappedGoodInput {
  basePrice: number;
  globalPrice: number;
  globalSupply?: number;
  globalDemand?: number;
  priceAttribution?: CommodityPriceAttribution | null;
}

export interface CappedGoodTarget {
  /** Price the market formula asked for before the cap or pace held it back. */
  targetPrice: number;
  /** Target against the original base price, in percent. */
  targetVsBasePct: number;
  /** Demand divided by supply, null when supply is unknown or zero. */
  demandSupplyRatio: number | null;
}

/**
 * The price a held-back good is heading to: applied price minus the negative
 * adjustment lag. Null unless the stored parts add up to the applied price.
 */
export function cappedGoodTarget(c: CappedGoodInput): CappedGoodTarget | null {
  const a = c.priceAttribution;
  if (!a || !(c.basePrice > 0)) return null;
  const parts = [
    a.appliedPrice,
    a.realBasePrice,
    a.nominalInflation,
    a.scarcityMemory,
    a.producerInputCostPassThrough,
    a.marketBalance,
    a.adjustmentLag,
    a.explicitOverride,
  ];
  if (parts.some((p) => typeof p !== "number" || !Number.isFinite(p))) return null;
  if (!(a.appliedPrice > 0) || !(a.adjustmentLag < 0)) return null;
  const sum =
    a.realBasePrice +
    a.nominalInflation +
    a.scarcityMemory +
    a.producerInputCostPassThrough +
    a.marketBalance +
    a.adjustmentLag +
    a.explicitOverride;
  if (Math.abs(sum - a.appliedPrice) > a.appliedPrice * RECONCILE_TOLERANCE) return null;
  const targetPrice = a.appliedPrice - a.adjustmentLag;
  const supply = c.globalSupply ?? 0;
  const demand = c.globalDemand ?? 0;
  return {
    targetPrice,
    targetVsBasePct: (targetPrice / c.basePrice - 1) * 100,
    demandSupplyRatio: supply > 0 && demand >= 0 ? demand / supply : null,
  };
}

/** Plain-words line for a good held at the cap. */
export function cappedGoodNote(t: CappedGoodTarget): string {
  const pct = Math.round(t.targetVsBasePct);
  const base = `held at the cap; the market price would be about ${pct >= 0 ? "+" : ""}${pct}% without it`;
  return t.demandSupplyRatio != null
    ? `${base} (demand is ${t.demandSupplyRatio.toFixed(2)}x supply)`
    : base;
}
