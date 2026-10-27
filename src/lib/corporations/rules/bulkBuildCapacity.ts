/**
 * Rules for building capacity across many sectors at once (suggestion 391).
 *
 * Pure: plain data in, plain data out. The command shell loads the sectors,
 * prices each one through the single-sector build path, and uses these helpers
 * to pick the sectors, size each order and decide which orders the cash covers.
 */
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";

/** Most sectors one bulk request may price or build. Each one is a full single-sector build. */
export const BULK_BUILD_MAX_SECTORS = 50;
/** Most facilities per sector the "facilities" rule accepts. */
export const BULK_BUILD_MAX_FACILITIES = 100;

/**
 * How big each sector's order is.
 *
 * - `facilities`: a whole number of facilities per sector. `count: 1` is
 *   exactly what each sector's own build dialog opens at.
 * - `percent`: a share of the sector's current capacity, rounded UP to whole
 *   facilities and never less than one, because the build dialog and the
 *   single-sector command both buy whole facilities.
 */
export type BulkBuildRule =
  { kind: "facilities"; count: number } | { kind: "percent"; percent: number };

export interface BulkBuildCandidate {
  sectorId: string;
  countryId: string;
  sectorType: string;
  stateId: string;
}

export interface BulkBuildSelection {
  countryId?: string | null;
  sectorType?: string | null;
  /** When present, only these sectors (still narrowed by the other filters). */
  sectorIds?: readonly string[] | null;
}

/** The sectors a selection matches, in a stable order (country, sector type, state). */
export function selectBulkBuildSectors<T extends BulkBuildCandidate>(
  sectors: readonly T[],
  selection: BulkBuildSelection
): T[] {
  const ids = selection.sectorIds?.length ? new Set(selection.sectorIds) : null;
  return sectors
    .filter(
      (s) =>
        (!selection.countryId || s.countryId === selection.countryId) &&
        (!selection.sectorType || s.sectorType === selection.sectorType) &&
        (!ids || ids.has(s.sectorId))
    )
    .sort(
      (a, b) =>
        a.countryId.localeCompare(b.countryId) ||
        a.sectorType.localeCompare(b.sectorType) ||
        a.stateId.localeCompare(b.stateId) ||
        a.sectorId.localeCompare(b.sectorId)
    );
}

/**
 * Capacity units to order for one sector under `rule`. Always a positive
 * whole number of facilities, capped at `maxUnitsPerOrder`, the single-order
 * maximum the build command accepts (passed in so this module stays light
 * enough for the client bundle).
 */
export function bulkBuildUnits(
  rule: BulkBuildRule,
  sector: { sectorType: string; capacityUnits: number },
  maxUnitsPerOrder: number
): number {
  const perFacility = Math.max(1, plantSizeUnits(sector.sectorType as OperatingSectorType));
  let facilities: number;
  if (rule.kind === "facilities") {
    facilities = Math.max(1, Math.floor(rule.count));
  } else {
    const capacity = Number.isFinite(sector.capacityUnits) ? Math.max(0, sector.capacityUnits) : 0;
    facilities = Math.max(1, Math.ceil((capacity * rule.percent) / 100 / perFacility));
  }
  const maxFacilities = Math.max(1, Math.floor(maxUnitsPerOrder / perFacility));
  return Math.min(facilities, maxFacilities) * perFacility;
}

export type BulkBuildRowStatus = "ready" | "over_budget" | "blocked";

export interface BulkBuildQuoteRow {
  sectorId: string;
  /** Total charge in the corporation's currency, transfer fee included. */
  costLocal: number;
  /** Null when the single-sector path would accept the order. */
  blockedReason: string | null;
}

export interface BulkBuildPlanRow extends BulkBuildQuoteRow {
  status: BulkBuildRowStatus;
}

export interface BulkBuildPlan {
  rows: BulkBuildPlanRow[];
  /** What the ready rows cost together. */
  readyCostLocal: number;
  readyCount: number;
  /** Cash left after the ready rows. */
  cashAfterLocal: number;
}

/**
 * Walk the quotes in order and spend `cashLocal` on them. A blocked row costs
 * nothing and is passed over. The first row the remaining cash cannot cover
 * stops the spending: it and every later buildable row are `over_budget`. That
 * is the same stop the apply step makes, so the preview shows exactly which
 * sectors an apply would build.
 */
export function planBulkBuild(
  quotes: readonly BulkBuildQuoteRow[],
  cashLocal: number
): BulkBuildPlan {
  let remaining = Number.isFinite(cashLocal) ? cashLocal : 0;
  let stopped = false;
  let readyCostLocal = 0;
  let readyCount = 0;
  const rows = quotes.map((q): BulkBuildPlanRow => {
    if (q.blockedReason) return { ...q, status: "blocked" };
    if (stopped || q.costLocal > remaining) {
      stopped = true;
      return { ...q, status: "over_budget" };
    }
    remaining -= q.costLocal;
    readyCostLocal += q.costLocal;
    readyCount += 1;
    return { ...q, status: "ready" };
  });
  return { rows, readyCostLocal, readyCount, cashAfterLocal: remaining };
}
