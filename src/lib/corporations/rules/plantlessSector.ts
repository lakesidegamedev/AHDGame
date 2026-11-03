/**
 * How the corporation page reads a plants sector that owns no plants yet, and
 * the full cost bill of a funded producer row.
 *
 * Pure rules: plain sector fields in, plain fields out.
 *
 * A sector opened under plants starts with an empty plant ledger and its first
 * plants on order. The commands that open it still stamp the old starting
 * figures (a nameplate `revenue` and a starting crew of `workers`), and the
 * first plants turn rewrites both from capacity, which is zero. Until that turn
 * runs the row read as a business with staff and income and no plants at all.
 * The turn ends up at zero for both, so the read path shows that from the start.
 */

export interface PlantlessSectorFields {
  capitalStock?: number | null;
  plantCount?: number | null;
  producedUnits?: number | null;
  realizedRevenue?: number | null;
  revenue: number;
  workers?: number | null;
  workersDesired?: number | null;
}

const positive = (v: number | null | undefined): boolean =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * True when the sector has no capacity, no plants, made nothing and booked no
 * sale. A sector selling down old stock with its plants gone still booked a
 * sale, so it is not plantless here and keeps its figures.
 */
export function isPlantlessSector(sector: PlantlessSectorFields): boolean {
  return (
    !positive(sector.capitalStock) &&
    !positive(sector.plantCount) &&
    !positive(sector.producedUnits) &&
    !positive(sector.realizedRevenue)
  );
}

/**
 * The sector as the plants read path should see it: unchanged unless it is
 * plantless, in which case it has no revenue and no crew. Plants tier only.
 */
export function plantlessSectorView<T extends PlantlessSectorFields>(sector: T): T {
  if (!isPlantlessSector(sector)) return sector;
  return { ...sector, revenue: 0, realizedRevenue: 0, workers: 0, workersDesired: 0 };
}

/**
 * The full daily cost bill a funded producer settlement wrote for a sector, or
 * null when the row is not a funded one or the bill is missing.
 *
 * Funded rows carry summary lines only, so the page used to rebuild the bill as
 * revenue x (1 - margin). That holds while the sector sells, but a sector that
 * sold nothing has zero revenue and a zero margin, so the rebuilt bill was zero
 * and the row showed the stock it made as profit (a plant losing money read
 * as earning it).
 */
export function fundedSectorTotalCost(
  pnl: { source?: string; totalCost?: number | null } | null | undefined
): number | null {
  if (!pnl || pnl.source !== "funded") return null;
  const cost = pnl.totalCost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
}

/**
 * The daily profit a funded producer settlement booked for a sector, or null
 * when the row is not a funded one or the line is missing. Read directly for
 * the same reason as the bill: rebuilt from revenue x margin, a sector that
 * sold nothing showed only its growth charge as a loss.
 */
export function fundedSectorProfit(
  pnl: { source?: string; profit?: number | null } | null | undefined
): number | null {
  if (!pnl || pnl.source !== "funded") return null;
  const profit = pnl.profit;
  return typeof profit === "number" && Number.isFinite(profit) ? profit : null;
}

/**
 * A sector's daily operating bill and profit as the sector page shows them.
 * The engine's own lines win; a funded row's booked profit is next, with the
 * bill sized so maintenance + growth sum back to it; the margin inversion is
 * the fallback for rows with neither. Freight is outside all three.
 */
export function sectorMaintenanceAndProfit(args: {
  engine: { operatingCost: number; profit: number } | null;
  fundedProfit: number | null;
  economicRevenue: number;
  effectiveMarginPct: number;
  growthCost: number;
  freightNet: number;
}): { maintenance: number; profit: number } {
  const { engine, fundedProfit, economicRevenue, growthCost, freightNet } = args;
  if (engine) return { maintenance: engine.operatingCost, profit: engine.profit + freightNet };
  const maintenance =
    fundedProfit != null
      ? economicRevenue - fundedProfit - growthCost
      : economicRevenue * (1 - args.effectiveMarginPct / 100);
  return { maintenance, profit: economicRevenue - maintenance - growthCost + freightNet };
}
