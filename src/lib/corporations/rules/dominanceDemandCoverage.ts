/**
 * Dominance is share of a market that is actually served. When funded buyers
 * want far more than every seller delivers, the first seller holds 100% of
 * sales but not of the market. Measuring share against max(supply, demand) is
 * the seller share scaled by delivered / funded demand, capped at 1.
 *
 * Rules only: plain data in, plain data out.
 */
import type { BuildDemandRow } from "./fundedBuildDemand";

/**
 * Served fraction (0..1) of the market for the given scope. Several outputs
 * take the best-served one, so a sector is never relieved by its thinnest
 * output. Unmeasured or empty books return 1 (no relief).
 */
export function demandCoverage(
  rows: readonly BuildDemandRow[] | null | undefined,
  scope: BuildDemandRow["scope"]
): number {
  let best: number | null = null;
  for (const row of rows ?? []) {
    if (row.scope !== scope) continue;
    const { funded, delivered } = row;
    if (funded == null || delivered == null || !(funded > 0)) return 1;
    const served = Math.min(1, Math.max(0, delivered) / funded);
    best = best == null ? served : Math.max(best, served);
  }
  return best ?? 1;
}

/** Share % measured against max(total supply, funded demand). */
export function demandAdjustedSharePercent(sharePercent: number, coverage: number): number {
  if (!Number.isFinite(sharePercent)) return 0;
  const c = Number.isFinite(coverage) ? Math.min(1, Math.max(0, coverage)) : 1;
  return sharePercent * c;
}

/**
 * Coverage for the local and national share. A commodity sold only in-state has
 * no national book, so its national share is measured against the state's.
 */
export function shareCoverages(rows: readonly BuildDemandRow[] | null | undefined): {
  local: number;
  national: number;
} {
  const local = demandCoverage(rows, "regional");
  const hasNational = (rows ?? []).some((r) => r.scope === "national");
  return { local, national: hasNational ? demandCoverage(rows, "national") : local };
}
