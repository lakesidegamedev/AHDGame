/**
 * What the Pricing panel says about last turn's sales on a funded producer
 * market. The legacy clearing pass writes `soldFraction` and `clearingFactor`,
 * but a funded turn never runs it, so those fields keep whatever they last held
 * and a plant that sold nothing could read "100% sold" at x1.00. The funded
 * receipt is the record of what actually happened, so the panel reads it.
 *
 * Pure: a settled receipt in, display figures out.
 */

export interface ClearingReceipt {
  turn: number;
  offeredUnits?: number | null;
  soldUnits?: number | null;
  revenue?: number | null;
  products?: ReadonlyArray<{
    offeredUnits?: number | null;
    soldUnits?: number | null;
    internalDeliveredUnits?: number | null;
    revenue?: number | null;
    askingUnitPrice?: number | null;
  }>;
}

export interface FundedClearingReading {
  /** Units sold to buyers over units offered (0-1). */
  soldFraction: number;
  /** Units handed to the company's own sites over units offered (0-1). Not a sale. */
  ownSiteFraction: number;
  /**
   * Revenue realized over what the units put up for outside sale would have
   * earned at the asking price. 0 when nothing sold; null when nothing was put
   * up for outside sale.
   */
  clearingFactor: number | null;
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

const share = (x: number) => Math.max(0, Math.min(1, x));

/** Null when the receipt is older than last turn or nothing was offered. */
export function fundedClearingReading(
  receipt: ClearingReceipt | null | undefined,
  currentTurn: number
): FundedClearingReading | null {
  if (!receipt || !(receipt.turn >= currentTurn - 1)) return null;
  const offered = positive(receipt.offeredUnits);
  if (offered <= 0) return null;
  let internal = 0;
  let askedValue = 0;
  for (const p of receipt.products ?? []) {
    const own = positive(p.internalDeliveredUnits);
    internal += own;
    askedValue += Math.max(0, positive(p.offeredUnits) - own) * positive(p.askingUnitPrice);
  }
  return {
    soldFraction: share(positive(receipt.soldUnits) / offered),
    ownSiteFraction: share(internal / offered),
    clearingFactor: askedValue > 0 ? positive(receipt.revenue) / askedValue : null,
  };
}
