import type { OfferMissReason } from "./unfilledReasons";

/** Why a plant did not get all of an input it planned to use. */
export type InputBlocker =
  | "sold_out"
  | "price_above_limit"
  | "not_delivered"
  | "no_offers"
  | "not_eligible"
  | "buyer_budget"
  | "freight_capacity";

/** One input's needed, arrived and missing units for a turn, in per-turn physical units. */
export interface InputReceipt {
  commodity: string;
  neededUnits: number;
  arrivedUnits: number;
  missingUnits: number;
  /** Part of the delivered units that came from the company's own sites. Absent on older receipts. */
  ownSiteUnits?: number;
  /** Set only when units are missing. */
  blocker?: InputBlocker;
}

const EPSILON = 1e-9;

/**
 * Needed against arrived for one input, with the blocker the settlement saw.
 * Arrived counts stock on hand plus units delivered this turn. When units are
 * missing: unsold supply within the plant's limit price means supply existed
 * but never reached it (freight, lane or funds); unsold supply only above the
 * limit means the price was the blocker; none at all means sellers sold out.
 */
export function buildInputReceipt(args: {
  commodity: string;
  neededUnits: number;
  stockUnits: number;
  boughtUnits: number;
  /** Delivered units that came from the company's own sites; recorded, never costed here. */
  ownSiteUnits?: number;
  unsoldWithinLimitUnits: number;
  unsoldAboveLimitUnits: number;
  /**
   * Settlement's own reading of the unsold offers, when it recorded one: the
   * reason nearest to a sale among them, and whether the book had any offers.
   * Absent on older receipts, which keep the three-way inference above.
   */
  recorded?: { nearestMiss: OfferMissReason | null; bookHadOffers: boolean };
}): InputReceipt {
  const neededUnits = Math.max(0, args.neededUnits);
  const arrivedUnits = Math.max(0, args.stockUnits) + Math.max(0, args.boughtUnits);
  const missingUnits = Math.max(0, neededUnits - arrivedUnits);
  const receipt: InputReceipt = {
    commodity: args.commodity,
    neededUnits,
    arrivedUnits,
    missingUnits,
    ...(args.ownSiteUnits !== undefined
      ? { ownSiteUnits: Math.min(Math.max(0, args.ownSiteUnits), Math.max(0, args.boughtUnits)) }
      : {}),
  };
  if (missingUnits <= EPSILON * Math.max(1, neededUnits)) return { ...receipt, missingUnits: 0 };
  if (args.recorded) {
    const { nearestMiss, bookHadOffers } = args.recorded;
    if (nearestMiss) return { ...receipt, blocker: nearestMiss };
    if (!bookHadOffers) return { ...receipt, blocker: "no_offers" };
    return { ...receipt, blocker: args.commodity === "freight" ? "freight_capacity" : "sold_out" };
  }
  return {
    ...receipt,
    blocker:
      args.unsoldWithinLimitUnits > EPSILON
        ? "not_delivered"
        : args.unsoldAboveLimitUnits > EPSILON
          ? "price_above_limit"
          : "sold_out",
  };
}
