import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import type { InputBlocker, InputReceipt } from "@/lib/market/producerMarket/rules/inputReceipt";

/** Smallest missing share of the need that counts as a shortage. */
export const INPUT_SHORT_SHARE = 0.001;

/** One input's last settled turn on the same daily basis as the sector's flow rows. */
export interface InputShortageReading {
  turn: number;
  neededPerDay: number;
  arrivedPerDay: number;
  missingPerDay: number;
  blocker?: InputBlocker;
}

/**
 * Last turn's needed, arrived and missing units for one input, in units a day
 * (receipts are per turn). Null when the receipt carries no row for it, such
 * as a receipt written before per-input receipts existed.
 */
export function inputShortageReading(
  receipts: readonly InputReceipt[] | null | undefined,
  commodity: string,
  turn: number
): InputShortageReading | null {
  const row = receipts?.find((r) => r.commodity === commodity);
  if (!row) return null;
  const missingShare = row.neededUnits > 0 ? row.missingUnits / row.neededUnits : 0;
  const short = missingShare > INPUT_SHORT_SHARE;
  return {
    turn,
    neededPerDay: row.neededUnits * TURNS_PER_DAY,
    arrivedPerDay: row.arrivedUnits * TURNS_PER_DAY,
    missingPerDay: short ? row.missingUnits * TURNS_PER_DAY : 0,
    ...(short && row.blocker ? { blocker: row.blocker } : {}),
  };
}

/** Plain-words reason for a blocker, for the shortage row. */
export function inputBlockerText(blocker: InputBlocker): string {
  switch (blocker) {
    case "sold_out":
      return "Sellers had none left to sell.";
    case "price_above_limit":
      return "Every offer was priced above your limit.";
    case "not_delivered":
      return "Supply was on offer within your limit but did not reach this plant. Check freight, the trade lane and your funds.";
  }
}
