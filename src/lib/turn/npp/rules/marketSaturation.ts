/**
 * Physical market saturation for NPP placement: how hard the demand throttle is
 * holding the plants that already serve a state-sector cell.
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 *
 * Why not price or fill. Price ratio and `soldFraction` miss a glut once the
 * throttle has done its job: a throttled plant sells most of what it makes
 * (fill 0.6-0.9) while running at a tenth of capacity, and a price ratio of
 * 2-3x base reads as shortage everywhere. The throttle is the direct measure of
 * unmet demand, so placement reads it.
 *
 * Saturation of a cell is the capacity-weighted demand throttle of its plants.
 * Mothballed capacity counts at 0: it is capacity the market already refused.
 * A cell with no capacity carrying a throttle reading has no evidence and
 * returns null, which never blocks.
 */

import type { CommodityType, ExtractableResource } from "@/lib/constants/commodities";
import { bucketKey } from "@/lib/market/marketBuckets";
import { sectorDemandGapUnits } from "@/lib/market/sectorDemandGap";
import { COMMODITY_BASE_PRICES, commodityMixWeight } from "@/lib/constants/commodities";
import { nppDemandThrottle, type FundedReceiptLike } from "./fundedSellThrough";

/**
 * A cell has room for another plant only when its plants run, capacity-weighted,
 * at essentially their full capacity: the demand throttle is below 1 exactly
 * when a plant cannot sell all it could make, so any cell under this bar is
 * already demand-limited and a new plant only splits sales that are spoken for.
 * Stricter than the bar an incumbent must clear to grow (NPP_GROWTH_MIN_THROTTLE,
 * 0.9): growing a plant that sells 90% adds a little capacity to a market it
 * already serves, founding adds a whole new plant. Live turn 255, with a 0.9
 * bar: 78 of 90 AI foundings entered cells at 0.9 or above, and 357 of the 569
 * AI plants founded since turn 246 ran below half capacity.
 */
export const NPP_SATURATED_MARKET_THROTTLE = 0.98;

export interface SaturationSectorLike {
  stateId: string;
  sectorType: string;
  capitalStock?: number | null;
  demandThrottleFactor?: number | null;
  mothballed?: boolean | null;
  /** Funded settlement receipt; a funded world reads sell-through from it. */
  producerSettlement?: FundedReceiptLike | null;
}

interface CellTally {
  capacity: number;
  runCapacity: number;
}

export type MarketSaturationIndex = ReadonlyMap<string, CellTally>;

/**
 * One sector's contribution to its cell, or null when it carries no reading.
 * Shared by the index and by `excluding` so the two can never disagree.
 */
function contributionOf(
  s: SaturationSectorLike,
  fundedWorldEpoch: string | null | undefined
): { capacity: number; run: number } | null {
  const capacity = s.capitalStock;
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) return null;
  if (s.mothballed === true) return { capacity, run: 0 };
  // Funded worlds read sell-through, not sold / capacity: an input-starved
  // plant that sells all it makes is not evidence of a glut (rules/fundedSellThrough).
  const throttle = nppDemandThrottle(s, fundedWorldEpoch);
  if (throttle != null) {
    return { capacity, run: capacity * Math.max(0, Math.min(1, throttle)) };
  }
  // Mid-build, legacy or not yet cleared: no reading, no evidence.
  return null;
}

/**
 * `fundedWorldEpoch` is the world epoch when the funded producer market runs,
 * absent on a legacy world.
 */
export function buildMarketSaturationIndex(
  sectors: readonly SaturationSectorLike[],
  fundedWorldEpoch?: string | null
): MarketSaturationIndex {
  const index = new Map<string, CellTally>();
  for (const s of sectors) {
    const c = contributionOf(s, fundedWorldEpoch);
    if (!c) continue;
    const key = bucketKey(s.stateId, s.sectorType);
    const tally = index.get(key) ?? { capacity: 0, runCapacity: 0 };
    tally.capacity += c.capacity;
    tally.runCapacity += c.run;
    index.set(key, tally);
  }
  return index;
}

/**
 * Capacity-weighted throttle of a cell in [0, 1], or null without evidence.
 * `excluding` removes one sector's own contribution, so a mothballed plant
 * deciding whether to restart is judged on its rivals, not on its own cold
 * capacity.
 */
export function marketSaturationOf(
  index: MarketSaturationIndex,
  cell: {
    stateId: string;
    sectorType: string;
  },
  excluding?: SaturationSectorLike,
  fundedWorldEpoch?: string | null
): number | null {
  const tally = index.get(bucketKey(cell.stateId, cell.sectorType));
  if (!tally) return null;
  const own = excluding ? contributionOf(excluding, fundedWorldEpoch) : null;
  const capacity = tally.capacity - (own?.capacity ?? 0);
  const run = tally.runCapacity - (own?.run ?? 0);
  if (!(capacity > 1e-9)) return null;
  return Math.max(0, Math.min(1, run / capacity));
}

/**
 * NPP-run plants whose own throttle sits under this share of capacity for
 * NPP_FLOOR_MOTHBALL_TURNS consecutive glutted turns are mothballed, whatever
 * the price ratio says. Just above the 0.1 throttle floor and the 0.25 crew
 * floor: the plant pays a quarter of its crew and its upkeep to sell a tenth.
 */
export const NPP_FLOOR_MOTHBALL_THROTTLE = 0.25;

/**
 * Glutted-turn streak (`demandIdleTurns`) before the floor mothball applies.
 * Twice the idle-retirement grace, so retirement gets the first chance to
 * shrink a plant that is only somewhat oversized.
 */
export const NPP_FLOOR_MOTHBALL_TURNS = 12;

export function isStuckAtThrottleFloor(
  sector: {
    demandThrottleFactor?: number | null;
    demandIdleTurns?: number | null;
    producerSettlement?: FundedReceiptLike | null;
  },
  fundedWorldEpoch?: string | null
): boolean {
  const t = nppDemandThrottle(sector, fundedWorldEpoch);
  const streak = sector.demandIdleTurns;
  return (
    typeof t === "number" &&
    Number.isFinite(t) &&
    t < NPP_FLOOR_MOTHBALL_THROTTLE &&
    typeof streak === "number" &&
    streak >= NPP_FLOOR_MOTHBALL_TURNS
  );
}

export function isMarketSaturated(level: number | null | undefined): boolean {
  return (
    typeof level === "number" && Number.isFinite(level) && level < NPP_SATURATED_MARKET_THROTTLE
  );
}

/**
 * Share of a cell's measured unmet demand one AI founding may build for.
 * Building for the whole gap overstates what a market still wants: on live turn 257, 47 of 54 AI foundings entered cells
 * whose plants sold out, and the young AI plants then made up 141 of the 263
 * plants running under a fifth of capacity, because a sold-out market that is
 * only slightly short cannot absorb a full-size new plant. Half leaves room for
 * a second entrant and for the incumbents' own probe.
 */
export const NPP_FOUNDING_UNMET_SHARE = 0.5;

/**
 * The output legs a cell can actually supply. An extraction cell keeps only the
 * resources its state still holds an unclaimed deposit of: a mine cannot answer
 * a shortage of a resource the state does not have. Every other sector, and a
 * world with no per-resource deposit signal, keeps the whole mix.
 */
export function depositBoundSupplyMix(
  supplyMix: Partial<Record<CommodityType, number>>,
  cell: { stateId: string; sectorType: string },
  resourceHeadroomOf: ((stateId: string, resource: ExtractableResource) => number) | undefined
): Partial<Record<CommodityType, number>> {
  if (cell.sectorType !== "extraction" || !resourceHeadroomOf) return supplyMix;
  const bound: Partial<Record<CommodityType, number>> = {};
  for (const [commodity, rate] of Object.entries(supplyMix) as [CommodityType, number][]) {
    if (resourceHeadroomOf(cell.stateId, commodity as ExtractableResource) > 0) {
      bound[commodity] = rate;
    }
  }
  return bound;
}

/**
 * Unmet demand for one cell in sector output units, for the output mix the new
 * plant would actually run. "mean" is the rate-weighted mean gap
 * (sectorDemandGapUnits, the same helper the player build preview uses); "max"
 * is the deepest single leg, for critical-shortage entries whose shortage leg a
 * balanced co-product would otherwise dilute (logistics averages freight with
 * consulting). Null when no leg can be read, which never caps.
 */
export function cellUnmetDemandUnits(args: {
  supplyMix: Partial<Record<CommodityType, number>>;
  gapFor: (commodity: CommodityType) => number | null;
  aggregate?: "mean" | "max";
}): number | null {
  let readable = false;
  const gapOf = (commodity: CommodityType) => {
    const gap = args.gapFor(commodity);
    if (gap == null) return 0;
    readable = true;
    return Math.max(0, gap);
  };
  if (args.aggregate === "max") {
    let best = 0;
    for (const [commodity, rate] of Object.entries(args.supplyMix) as [CommodityType, number][]) {
      if (!(rate > 0)) continue;
      const weight = commodityMixWeight(args.supplyMix, COMMODITY_BASE_PRICES, commodity);
      if (!(weight > 0)) continue;
      best = Math.max(best, gapOf(commodity) / weight);
    }
    return readable ? best : null;
  }
  const units = sectorDemandGapUnits(args.supplyMix, gapOf);
  return readable ? units : null;
}

/**
 * Founding size and eligibility from a cell's unmet demand. The plant builds
 * for at most NPP_FOUNDING_UNMET_SHARE of it, and enters only when that share
 * covers one starter facility: flooring a smaller share up to a whole facility
 * would build more than the share. No reading never caps or blocks.
 */
export function foundingUnmetSizing(args: { unmetUnits: number | null; starterUnits: number }): {
  sizeCap: number;
  blocksEntry: boolean;
} {
  if (args.unmetUnits == null || !Number.isFinite(args.unmetUnits)) {
    return { sizeCap: Number.POSITIVE_INFINITY, blocksEntry: false };
  }
  const sizeCap = Math.max(0, args.unmetUnits) * NPP_FOUNDING_UNMET_SHARE;
  return { sizeCap, blocksEntry: sizeCap < args.starterUnits };
}

/**
 * Whether a cell shows a physical shortage that can justify founding outside a
 * corp's own type. With a demand signal wired, it must read a positive unmet
 * gap; an unreadable gap is not evidence. With no signal at all (legacy callers
 * and isolated tests) the price-based test stands alone, as before.
 */
export function isPhysicallyShort(
  unmetUnitsOf: ((cell: never) => number | null) | undefined,
  read: () => number | null
): boolean {
  if (unmetUnitsOf === undefined) return true;
  const unmet = read();
  return unmet != null && unmet > 0;
}

/**
 * Whether a corp counts as a same-type builder for the essential-shortage
 * valve: it runs the NPP brain (NPP CEO or player autopilot), is not
 * suspended, holds positive cash and its strategy allows founding (expand or
 * pivot). A corp that cannot enter must not stop another from filling a
 * shortage.
 */
export function canFoundAsBuilder(corp: {
  ceoType?: string | null;
  autopilotRun: boolean;
  suspended?: boolean | null;
  liquidCapital?: number | null;
  strategyId?: string | null;
}): boolean {
  if (corp.suspended === true) return false;
  if (corp.ceoType !== "npp" && !corp.autopilotRun) return false;
  if (!(typeof corp.liquidCapital === "number" && corp.liquidCapital > 0)) return false;
  // No recorded strategy yet: the default posture expands.
  const strategy = corp.strategyId ?? "expand";
  return strategy === "expand" || strategy === "pivot";
}

/**
 * Units an existing extraction plant may add this step, bounded by the unmet
 * demand for what it mines. The deposit step is the upper bound and demand is
 * the reason: a mine with nothing left to sell grows by nothing however much
 * deposit remains. `unmetUnits` is null when no demand signal is wired
 * (isolated callers), which leaves the deposit step alone.
 */
export function extractionDemandBoundUnits(
  depositStepUnits: number,
  unmetUnits: number | null
): number {
  if (unmetUnits == null) return depositStepUnits;
  if (!Number.isFinite(unmetUnits)) return 0;
  return Math.max(0, Math.min(depositStepUnits, Math.floor(unmetUnits)));
}
