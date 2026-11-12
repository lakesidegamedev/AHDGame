/**
 * Per-product sale price on a multi-output sector.
 *
 * The money panel's "each unit sold for" is revenue / units sold across every
 * output. On a sector making two things priced far apart that average reads
 * as though the dear product sold far under market. This splits the sector's
 * revenue by each output's recorded revenue share and divides by that
 * output's units sold.
 *
 * Units sold per output are rescaled to add up to the sector's booked sold
 * units, so a one-output sector gets exactly the existing average back.
 */
export interface PerProductSaleInput {
  commodity: string;
  /** Units made of this output, on any consistent basis across rows. */
  units: number;
  /** Share of this output that sold last turn (0-1), if known. */
  soldFraction?: number | null;
  /** This output's share of last turn's realized revenue (0-1), if recorded. */
  revenueShare?: number | null;
}

export function perProductSalePrices(args: {
  supplies: readonly PerProductSaleInput[];
  /** Sector revenue for the period (same basis as the blended average). */
  revenue: number | null | undefined;
  /** Units the sector sold for the period, all outputs together. */
  soldUnits: number | null | undefined;
  /** Sector-wide fill, used for a row with no per-output fill yet. */
  fallbackSoldFraction?: number | null;
}): Map<string, number> {
  const out = new Map<string, number>();
  const { supplies, revenue, soldUnits } = args;
  if (supplies.length < 2) return out;
  if (!(typeof revenue === "number" && revenue > 0 && Number.isFinite(revenue))) return out;
  if (!(typeof soldUnits === "number" && soldUnits > 0 && Number.isFinite(soldUnits))) return out;
  // Without a recorded split for every output the per-row prices cannot add
  // back up to revenue, so show none rather than a misleading partial set.
  if (!supplies.every((f) => typeof f.revenueShare === "number" && f.revenueShare >= 0)) return out;

  const soldWeight = supplies.map((f) => {
    const fill = f.soldFraction ?? args.fallbackSoldFraction ?? null;
    if (fill == null || !Number.isFinite(fill) || !Number.isFinite(f.units)) return 0;
    return Math.max(0, f.units) * Math.max(0, Math.min(1, fill));
  });
  const weightSum = soldWeight.reduce((sum, w) => sum + w, 0);
  if (!(weightSum > 0)) return out;

  supplies.forEach((f, i) => {
    const unitsSold = (soldWeight[i]! / weightSum) * soldUnits;
    const share = f.revenueShare as number;
    if (unitsSold > 0 && share > 0) out.set(f.commodity, (revenue * share) / unitsSold);
  });
  return out;
}
