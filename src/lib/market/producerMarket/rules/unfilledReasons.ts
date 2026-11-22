/**
 * Why an order's units stayed unfilled, read from the unsold offers left in
 * its book at close. Pure: plain data in, a reason out.
 */

/** Reasons an offer left in the book did not reach a buyer, closest to a sale first. */
export type OfferMissReason =
  "not_delivered" | "buyer_budget" | "not_eligible" | "price_above_limit";

export const OFFER_MISS_PRIORITY: readonly OfferMissReason[] = [
  "not_delivered",
  "buyer_budget",
  "not_eligible",
  "price_above_limit",
];

/** What a buyer still wanted at close, with the limits that bound what it could take. */
export interface UnfilledDemand {
  missingUnits: number;
  maximumUnitPrice: number;
  /** Null means every offer in the book is allowed. */
  eligible: ReadonlySet<string> | null;
  supplierOfferId?: string;
  /** What the buyer could still spend: order cap and account funds, whichever is lower. */
  spendLeft: number;
}

export interface UnsoldOffer {
  id: string;
  unitPrice: number;
}

/**
 * Why this buyer did not take this unsold offer. Null when the buyer only
 * ever dealt with another named supplier, so the offer was never its to take.
 */
export function offerMissReason(
  demand: UnfilledDemand,
  offer: UnsoldOffer
): OfferMissReason | null {
  if (demand.supplierOfferId && demand.supplierOfferId !== offer.id) return null;
  if (offer.unitPrice > demand.maximumUnitPrice) return "price_above_limit";
  if (demand.eligible && !demand.eligible.has(offer.id)) return "not_eligible";
  if (demand.spendLeft < offer.unitPrice * demand.missingUnits * (1 - 1e-9)) return "buyer_budget";
  return "not_delivered";
}

/** Best reason across several buyers of one offer: the one nearest to a sale. */
export function bestMissReason(
  demands: readonly UnfilledDemand[],
  offer: UnsoldOffer
): OfferMissReason | null {
  let best = OFFER_MISS_PRIORITY.length;
  for (const demand of demands) {
    const reason = offerMissReason(demand, offer);
    if (reason == null) continue;
    best = Math.min(best, OFFER_MISS_PRIORITY.indexOf(reason));
    if (best === 0) break;
  }
  return best < OFFER_MISS_PRIORITY.length ? OFFER_MISS_PRIORITY[best] : null;
}

/** Units of buyers' unfilled demand by why this seller's ask did not meet it. */
export function unservedByReason(
  demands: readonly UnfilledDemand[],
  offer: UnsoldOffer
): Partial<Record<OfferMissReason, number>> {
  const out: Partial<Record<OfferMissReason, number>> = {};
  for (const demand of demands) {
    const reason = offerMissReason(demand, offer);
    if (reason == null) continue;
    out[reason] = (out[reason] ?? 0) + demand.missingUnits;
  }
  return out;
}
