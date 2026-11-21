/**
 * Which of a multi-output site's products sold and which sat unsold.
 *
 * Sector-wide warnings blend every output into one sold share, so a campus
 * selling all its electronics and none of its software read "this plant cannot
 * sell its output". This names the products instead.
 */
export interface OutputSale {
  label: string;
  /** Share of this output outside buyers took last turn, 0-1; undefined when not measured. */
  soldFraction?: number;
  /** Settled receipt for this product (CEO only); ownSites are deliveries to the company's own sites. */
  settledSales?: { offered: number; ownSites: number };
  /** Older payload: share of this output handed to the company's own sites (CEO only). */
  ownSite?: { share: number };
}

export interface SplitItem {
  label: string;
  /** Percent of output sold or delivered to the company's own sites. */
  pct: number;
  /** True when part of `pct` went to the company's own sites rather than buyers. */
  ownSites: boolean;
}

export interface OutputSalesSplit {
  /** Products that sold or used at least SELLING_SHARE of their output. */
  selling: SplitItem[];
  /** Products that sold or used under STUCK_SHARE of their output. */
  stuck: SplitItem[];
}

export const SELLING_SHARE = 0.9;
export const STUCK_SHARE = 0.5;

function ownSiteShare(o: OutputSale): number {
  const settled = o.settledSales;
  if (settled && settled.offered > 0) return Math.max(0, settled.ownSites / settled.offered);
  return Math.max(0, o.ownSite?.share ?? 0);
}

/**
 * Null unless the site makes more than one measured product and they split.
 * Output delivered to the company's own sites is not a sale, but it is not
 * stranded either: a product that fed the company's other plants must never
 * be called "not selling".
 */
export function outputSalesSplit(
  outputs: readonly OutputSale[] | undefined
): OutputSalesSplit | null {
  const measured = (outputs ?? []).flatMap((o) => {
    if (typeof o.soldFraction !== "number" || !Number.isFinite(o.soldFraction)) return [];
    const own = ownSiteShare(o);
    const placed = Math.max(0, Math.min(1, o.soldFraction + own));
    return [{ label: o.label, placed, ownSites: own > 0.005 }];
  });
  if (measured.length < 2) return null;
  const item = (o: (typeof measured)[number]): SplitItem => ({
    label: o.label,
    pct: Math.round(o.placed * 100),
    ownSites: o.ownSites,
  });
  const selling = measured.filter((o) => o.placed >= SELLING_SHARE).map(item);
  const stuck = measured.filter((o) => o.placed < STUCK_SHARE).map(item);
  return selling.length > 0 && stuck.length > 0 ? { selling, stuck } : null;
}

/** "Software (12% sold)" or "Energy (100% sold or sent to your sites)", joined with "and". */
export function listOutputs(items: readonly SplitItem[]): string {
  const parts = items.map(
    (i) => `${i.label} (${i.pct}% ${i.ownSites ? "sold or sent to your sites" : "sold"})`
  );
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
