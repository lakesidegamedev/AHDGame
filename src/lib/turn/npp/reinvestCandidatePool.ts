/**
 * Reinvestment candidate shape and the local share lookup for NPP capacity
 * builds. Everything indexes the sector snapshot the shell already holds: no
 * turn-path reads.
 */
import type { CorporateSector } from "@/lib/db/types";
import { computeMarketSharePercent } from "@/lib/corporations/marketShare";
import { bucketKey } from "@/lib/market/marketBuckets";

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
  fill: number;
  /** Unmet demand in this sector's bucket, net of capacity already claimed. */
  unmetUnits: number;
  interventionPriority: number;
  /** Set when the growth leg was sized on short-lane bank finance (rules/shortageGrowthFinance). */
  shortageGrowth?: { pressure: number; paybackTurns: number };
}

/** Local revenue share of one sector, in percent of its (region, lane) bucket. */
export type LocalShareLookup = (
  sector: Pick<CorporateSector, "stateId" | "sectorType" | "industryModel" | "mediaDiscriminator"> & {
    revenue?: number;
  }
) => number;

/**
 * Local share from revenue over the bucket's total revenue, the same basis the
 * player build path prices on. A sector's revenue is in its host currency, as
 * is every rival in the bucket, so the ratio needs no conversion.
 */
export function buildLocalRevenueShareLookup(
  sectors: readonly Pick<
    CorporateSector,
    "stateId" | "sectorType" | "industryModel" | "mediaDiscriminator" | "revenue"
  >[]
): LocalShareLookup {
  const revenueByBucket = new Map<string, number>();
  const keyOf = (s: Parameters<LocalShareLookup>[0]) =>
    bucketKey(s.stateId, s.sectorType, s.industryModel, s.mediaDiscriminator);
  for (const sector of sectors) {
    const revenue = Number.isFinite(sector.revenue) ? Math.max(0, sector.revenue) : 0;
    const key = keyOf(sector);
    revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + revenue);
  }
  return (sector) =>
    computeMarketSharePercent(sector.revenue ?? 0, revenueByBucket.get(keyOf(sector)) ?? 0);
}
