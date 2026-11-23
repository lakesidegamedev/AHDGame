/**
 * What the Pricing panel says about last turn's sales on a funded producer
 * market. The legacy clearing pass still writes `soldFraction` and
 * `clearingFactor` on funded turns, but measures its own lagged book, not what
 * the plant was paid on, so a plant that sold nothing could read "100% sold" at
 * x1.00. The funded receipt is the record of what actually happened, so the
 * panel reads it.
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

/**
 * The share of offered output buyers took, for list rows. The settled receipt
 * wins; the legacy made-versus-sold figure is used only when there is none.
 */
export function soldShareForList(
  receipt: ClearingReceipt | null | undefined,
  currentTurn: number,
  legacyFill: number | null
): number | null {
  return fundedClearingReading(receipt, currentTurn)?.soldFraction ?? legacyFill;
}

/**
 * Units a settled receipt says were offered, when the list reads that receipt.
 * Weights a sector in the corporation-wide sold share so the roll-up and the
 * rows are one reading.
 */
export function settledOfferedUnits(
  receipt: ClearingReceipt | null | undefined,
  currentTurn: number
): number | null {
  if (!fundedClearingReading(receipt, currentTurn)) return null;
  return positive(receipt?.offeredUnits);
}

/**
 * Units sold over units offered (0-1), the one sector-level "sold" figure.
 * Null when nothing was offered.
 */
export function unitsSoldShare(
  offered: number | null | undefined,
  sold: number | null | undefined
): number | null {
  const o = positive(offered);
  return o > 0 ? share(positive(sold) / o) : null;
}
