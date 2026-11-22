/**
 * Reinvestment candidate shape and the local share lookup for NPP capacity
 * builds. Everything indexes the sector snapshot the shell already holds: no
 * turn-path reads.
 */
import { floorUnitsToPlants } from "@/lib/corporations/wholePlants/rules";
import { pacedGrowthUnits } from "@/lib/turn/npp/rules/buildPacing";
import type { CorporateSector } from "@/lib/db/types";
import { computeMarketSharePercent } from "@/lib/corporations/marketShare";
import { bucketKey } from "@/lib/market/marketBuckets";
import { shareRevenueOf } from "@/lib/corporations/rules/marketShareBasis";

/** A sized reinvestment candidate: replacement plus growth units for one sector. */
export interface ReinvestCandidate {
  sector: CorporateSector;
  units: number;
  /**
   * The part of `units` that is genuine new capacity (the growth leg), claimed
   * against the bucket's unmet demand. The replacement leg buys back capacity
   * that already existed in this market and claims nothing.
   */
  growthUnits: number;
  /** The replacement leg of `units`, before whole-plant rounding. */
  replacementUnits?: number;
  fill: number;
  /** Unmet demand in this sector's bucket, net of capacity already claimed. */
  unmetUnits: number;
  interventionPriority: number;
  /** Set when the growth leg was sized on short-lane bank finance (rules/shortageGrowthFinance). */
  shortageGrowth?: { pressure: number; paybackTurns: number };
}

/** Local revenue share of one sector, in percent of its (region, lane) bucket. */
export type LocalShareLookup = (
  sector: Pick<CorporateSector, "stateId" | "sectorType"> & {
    revenue?: number;
    realizedRevenue?: number;
  }
) => number;

/**
 * Local share from earned revenue over the bucket's total, the same measure the
 * player build path prices on. A sector's revenue is in its host currency, as
 * is every rival in the bucket, so the ratio needs no conversion.
 */
export function buildLocalRevenueShareLookup(
  sectors: readonly Pick<
    CorporateSector,
    "stateId" | "sectorType" | "revenue" | "realizedRevenue"
  >[]
): LocalShareLookup {
  const revenueOf = (s: Parameters<LocalShareLookup>[0]): number => shareRevenueOf(s);
  const revenueByBucket = new Map<string, number>();
  const keyOf = (s: Parameters<LocalShareLookup>[0]) => bucketKey(s.stateId, s.sectorType);
  for (const sector of sectors) {
    const own = revenueOf(sector);
    const revenue = Number.isFinite(own) ? Math.max(0, own) : 0;
    const key = keyOf(sector);
    revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + revenue);
  }
  return (sector) =>
    computeMarketSharePercent(revenueOf(sector), revenueByBucket.get(keyOf(sector)) ?? 0);
}

/**
 * A candidate with its growth leg cut to the pace room. Ordered growth is what
 * the order adds over the replacement leg, which whole-plant rounding can lift
 * above the sized growth. Replacement is kept, so a cut never cancels the
 * upkeep of worn capacity.
 */
export function pacedCandidate(
  candidate: Pick<ReinvestCandidate, "units" | "growthUnits" | "replacementUnits">,
  args: { roomUnits: number; plantUnits: number; wholePlants: boolean }
): { units: number; growthUnits: number } {
  const replacement = Math.max(0, candidate.replacementUnits ?? 0);
  const orderedGrowth = Math.max(0, candidate.units - replacement);
  if (orderedGrowth <= args.roomUnits) {
    return { units: candidate.units, growthUnits: candidate.growthUnits };
  }
  const allowed = pacedGrowthUnits({
    growthUnits: orderedGrowth,
    roomUnits: args.roomUnits,
    plantUnits: args.plantUnits,
    wholePlants: args.wholePlants,
  });
  const raw = replacement + allowed;
  const units =
    raw > 0 && args.wholePlants && args.plantUnits > 0
      ? Math.max(args.plantUnits, floorUnitsToPlants(raw, args.plantUnits))
      : raw;
  return { units, growthUnits: Math.min(candidate.growthUnits, allowed) };
}
