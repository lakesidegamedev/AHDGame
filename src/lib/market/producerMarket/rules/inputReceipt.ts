/** Why a plant did not get all of an input it planned to use. */
export type InputBlocker = "sold_out" | "price_above_limit" | "not_delivered";

/** One input's needed, arrived and missing units for a turn, in per-turn physical units. */
export interface InputReceipt {
  commodity: string;
  neededUnits: number;
  arrivedUnits: number;
  missingUnits: number;
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
  unsoldWithinLimitUnits: number;
  unsoldAboveLimitUnits: number;
}): InputReceipt {
  const neededUnits = Math.max(0, args.neededUnits);
  const arrivedUnits = Math.max(0, args.stockUnits) + Math.max(0, args.boughtUnits);
  const missingUnits = Math.max(0, neededUnits - arrivedUnits);
  const receipt: InputReceipt = {
    commodity: args.commodity,
    neededUnits,
    arrivedUnits,
    missingUnits,
  };
  if (missingUnits <= EPSILON * Math.max(1, neededUnits)) return { ...receipt, missingUnits: 0 };
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
