/**
 * Per-product fill for the NPP reinvestment gate.
 *
 * Whole-receipt fill = sold / produced lets a co-product plant be held shut by
 * its worst-selling product, and own-site deliveries never count. With the
 * stage on, fill is the best (sold + internal deliveries) / offered of any
 * product the sector makes; without product rows the caller keeps the old reading.
 */

export interface ProductFillRow {
  offeredUnits?: number | null;
  soldUnits?: number | null;
  internalDeliveredUnits?: number | null;
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

export function productFillEnabled(stage: number | null | undefined): boolean {
  return (stage ?? 0) >= 1;
}

/** A product below this share of the sector's offered units cannot pass the gate alone. */
export const PRODUCT_FILL_MIN_SHARE = 0.1;

/** Best per-product sell-through in [0, 1]; null when no product offered anything. */
export function bestProductSellThrough(
  products: readonly ProductFillRow[] | null | undefined
): number | null {
  if (!products || products.length === 0) return null;
  const total = products.reduce((n, p) => n + positive(p.offeredUnits), 0);
  let best: number | null = null;
  for (const p of products) {
    const offered = positive(p.offeredUnits);
    // A sliver of a side product selling out says nothing about the plant.
    if (offered <= 0 || offered < total * PRODUCT_FILL_MIN_SHARE) continue;
    const through = Math.min(
      1,
      (positive(p.soldUnits) + positive(p.internalDeliveredUnits)) / offered
    );
    if (best === null || through > best) best = through;
  }
  return best;
}

/** The fill the gate compares to its minimum: per-product when on and readable, else the old ratio. */
export function gateFill(
  stage: number | null | undefined,
  products: readonly ProductFillRow[] | null | undefined,
  produced: number,
  sold: number
): number {
  if (productFillEnabled(stage)) {
    const best = bestProductSellThrough(products);
    if (best !== null) return best;
  }
  return produced > 0 ? sold / produced : 0;
}
