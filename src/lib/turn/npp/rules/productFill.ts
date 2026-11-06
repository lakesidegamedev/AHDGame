/**
 * Per-product fill for the NPP reinvestment gate (gameConfig.nppGrowthPerProductFillStage).
 *
 * The gate reads fill = sold / produced across the whole receipt. A plant with
 * co-products (defense: ordnance and chemicals; construction: services and
 * materials; logistics: freight and consulting) is held shut by whichever
 * product sells worst, and units handed to the company's own sites never count
 * as sold. A short product that sells out is then never allowed to grow.
 *
 * With the stage on, fill is the best sell-through of any product the sector
 * makes: (sold + own-site deliveries) over offered. Without product rows the
 * caller keeps the old reading.
 *
 * Pure: receipt rows in, a number out.
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

/** Best per-product sell-through in [0, 1]; null when no product offered anything. */
export function bestProductSellThrough(
  products: readonly ProductFillRow[] | null | undefined
): number | null {
  if (!products || products.length === 0) return null;
  let best: number | null = null;
  for (const p of products) {
    const offered = positive(p.offeredUnits);
    if (offered <= 0) continue;
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
