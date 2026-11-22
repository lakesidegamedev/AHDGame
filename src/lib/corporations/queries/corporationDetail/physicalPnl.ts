import { computeFillRate } from "@/lib/corporations/financialFogOfWar";
import type { PhysicalRollups } from "./sectorRows";

export interface PhysicalPnlView {
  capacityUnits: number;
  producedUnits: number;
  soldUnits: number;
  /** Corp-wide fill is Σsold ÷ Σproduced, NOT the mean of the per-sector
   * ratios: a mean lets one tiny plant running at 5% drag the headline
   * for a corporation that is selling everything it makes. */
  fillRate: number | null;
  /** Share of everything produced that went to the company's own sites (0-1); null when none. */
  ownSiteShare: number | null;
  constructionInProgressAnchor: number;
  unitsOnOrder: number;
  buildingSectorCount: number;
  mothballedSectorCount: number;
  sectorCount: number;
}

/**
 * Corp-level physical P&L rollup, plants only.
 *
 * One object rather than eight loose keys so a client can test
 * `physical != null` as its plants switch and cannot end up half-reading it.
 * Inputs arrive already stated in the corp's home currency (anchor for
 * construction-in-progress); this rollup never converts, it only rounds.
 */
export function buildPhysicalPnl(
  plantsMode: boolean,
  rollups: PhysicalRollups,
  sectorCount: number
): PhysicalPnlView | null {
  if (!plantsMode) return null;
  return {
    capacityUnits: Math.round(rollups.totalCapacityUnits),
    producedUnits: Math.round(rollups.totalProducedUnits),
    soldUnits: Math.round(rollups.totalSoldUnits),
    // Corp-wide fill is Σsold ÷ Σproduced, NOT the mean of the per-sector
    // ratios: a mean lets one tiny plant running at 5% drag the headline
    // for a corporation that is selling everything it makes.
    fillRate: computeFillRate(rollups.totalProducedUnits, rollups.totalSoldUnits),
    ownSiteShare:
      rollups.totalProducedUnits > 0 && rollups.totalOwnSiteUnits > 0
        ? Math.min(1, rollups.totalOwnSiteUnits / rollups.totalProducedUnits)
        : null,
    constructionInProgressAnchor: Math.round(rollups.totalConstructionInProgressAnchor),
    unitsOnOrder: Math.round(rollups.totalUnitsOnOrder),
    buildingSectorCount: rollups.buildingSectorCount,
    mothballedSectorCount: rollups.mothballedSectorCount,
    sectorCount,
  };
}
