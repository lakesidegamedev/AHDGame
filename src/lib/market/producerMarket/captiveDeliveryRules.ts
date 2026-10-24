/**
 * Captive deliveries as sales (funded-market cutover). A plant that supplies
 * its own company's other sites books those units as internal deliveries: no
 * sale, no revenue. Every planning signal that reads sold units then sees a
 * plant that sells nothing. The demand plan cuts it to the probe run, the
 * zero-sales counter climbs, and an AI owner mothballs it after two turns,
 * which takes the input away from the sister plant it was feeding.
 *
 * Here internal deliveries count as sold units for those signals, valued at the
 * plant's own asking price for the profit test. No money moves: this changes
 * what the plan reads, not what the settlement pays.
 *
 * Pure: a settled receipt in, the receipt the planning signals read out.
 */
import type { PriorReceipt } from "./outputResponseRules";

export interface CaptiveProduct {
  internalDeliveredUnits?: number;
  askingUnitPrice?: number | null;
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Units the plant handed to its own sites last turn. */
export function internalDelivered(products: readonly CaptiveProduct[] | undefined): number {
  let units = 0;
  for (const p of products ?? []) units += positive(p.internalDeliveredUnits);
  return units;
}

/** Sold plus internally delivered units, the plant's real offtake. */
export function offtakeUnits(receipt: {
  soldUnits?: number;
  products?: readonly CaptiveProduct[];
}): number {
  return positive(receipt.soldUnits) + internalDelivered(receipt.products);
}

/** The receipt the planning signals read: internal deliveries as sales at the plant's ask. */
export function withCaptiveDeliveries<
  T extends PriorReceipt & { products?: readonly CaptiveProduct[] },
>(receipt: T): T {
  let units = 0;
  let value = 0;
  for (const p of receipt.products ?? []) {
    const u = positive(p.internalDeliveredUnits);
    units += u;
    value += u * positive(p.askingUnitPrice);
  }
  if (!(units > 0)) return receipt;
  return {
    ...receipt,
    soldUnits: positive(receipt.soldUnits) + units,
    revenue: (Number.isFinite(receipt.revenue) ? receipt.revenue : 0) + value,
  };
}
