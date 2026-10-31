/**
 * Output a plant handed to its own company's other sites. No sale and no money
 * move (see `captiveDeliveryRules`), so the sold figure and the revenue read
 * zero while the plant is in fact fully used. This turns the settled receipt
 * into what the sector row and the sector page say about it.
 *
 * Pure: a settled receipt in, display figures out.
 */
import type { CaptiveProduct } from "@/lib/market/producerMarket/captiveDeliveryRules";

export interface OwnSiteReceipt {
  turn: number;
  products?: ReadonlyArray<CaptiveProduct & { commodity: string; producedUnits?: number }>;
}

export interface OwnSiteProduct {
  commodity: string;
  /** Units handed to the company's own sites, receipt basis. */
  units: number;
  /** Share of this output's production (0-1). */
  share: number;
  /** Units at the plant's asking price, ₳. */
  valueAnchor: number;
}

export interface OwnSiteDeliveries {
  /** Share of everything the sector made that went to own sites (0-1). */
  share: number;
  units: number;
  valueAnchor: number;
  products: OwnSiteProduct[];
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** A receipt older than last turn is not "last turn". Null when nothing went to own sites. */
export function ownSiteDeliveries(
  receipt: OwnSiteReceipt | null | undefined,
  currentTurn: number
): OwnSiteDeliveries | null {
  if (!receipt || !(receipt.turn >= currentTurn - 1)) return null;
  const products: OwnSiteProduct[] = [];
  let units = 0;
  let value = 0;
  let produced = 0;
  for (const p of receipt.products ?? []) {
    const made = positive(p.producedUnits);
    produced += made;
    const u = positive(p.internalDeliveredUnits);
    if (u <= 0) continue;
    const valueAnchor = u * positive(p.askingUnitPrice);
    products.push({
      commodity: p.commodity,
      units: u,
      share: made > 0 ? Math.min(1, u / made) : 0,
      valueAnchor,
    });
    units += u;
    value += valueAnchor;
  }
  if (units <= 0) return null;
  return {
    share: produced > 0 ? Math.min(1, units / produced) : 0,
    units,
    valueAnchor: value,
    products,
  };
}

/** Label beside the Sold figure, e.g. "100% to your sites". Null when none. */
export function ownSiteLabel(share: number | null | undefined): string | null {
  if (share == null || !Number.isFinite(share) || share <= 0) return null;
  const pct = Math.round(share * 100);
  return `${pct < 1 ? "<1" : pct}% to your sites`;
}
