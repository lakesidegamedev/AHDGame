/**
 * Per-product sale price on a multi-output sector.
 *
 * A plain revenue over units average misreads a sector making two things
 * priced far apart. A plant with a funded sale record uses each product's
 * settled revenue over its settled units. Otherwise the sector's revenue is
 * split by each output's recorded revenue share, with units rescaled to the
 * booked sold units so a one-output sector gets the plain average back.
 */
export interface PerProductSaleInput {
  commodity: string;
  /** Units made of this output, on any consistent basis across rows. */
  units: number;
  /** Share of this output that sold last turn (0-1), if known. */
  soldFraction?: number | null;
  /** This output's share of last turn's realized revenue (0-1), if recorded. */
  revenueShare?: number | null;
  /** Funded sale record: settled revenue over settled units sold for this output. */
  settledUnitPrice?: number | null;
}

export function perProductSalePrices(args: {
  supplies: readonly PerProductSaleInput[];
  /** Sector revenue for the period (same basis as the blended average). */
  revenue: number | null | undefined;
  /** Units the sector sold for the period, all outputs together. */
  soldUnits: number | null | undefined;
  /** Sector-wide fill, used for a row with no per-output fill yet. */
  fallbackSoldFraction?: number | null;
  /** The plant has a funded sale record: prices come only from `settledUnitPrice`. */
  settled?: boolean;
}): Map<string, number> {
  const out = new Map<string, number>();
  const { supplies, revenue, soldUnits } = args;
  if (args.settled) {
    for (const f of supplies) {
      const price = f.settledUnitPrice;
      if (typeof price === "number" && Number.isFinite(price) && price > 0)
        out.set(f.commodity, price);
    }
    return out;
  }
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
