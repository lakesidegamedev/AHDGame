/** Why paid orders stayed unfilled although the company offered the product, from settlement only. */
import type { UnsoldReading } from "./unsoldReason";
import {
  OFFER_MISS_PRIORITY,
  type OfferMissReason,
} from "@/lib/market/producerMarket/rules/unfilledReasons";

export type UnservedDemandReason =
  | "sold_out"
  | "ask_above_buyers"
  | "not_reached"
  | "not_offered"
  | "buyers_not_eligible"
  | "buyers_out_of_funds";

/** Offered units counted as fully taken at or above this share. */
export const TAKEN_ENOUGH_SHARE = 0.99;

export function unservedDemandReason(args: {
  unmetUnits: number | null | undefined;
  offered: number | null | undefined;
  soldOutside: number | null | undefined;
  ownSites: number | null | undefined;
  unsold?: UnsoldReading | null;
  /** Settlement's own count of unfilled buyer units by reason, when recorded. */
  unservedBy?: Partial<Record<OfferMissReason, number>> | null;
}): UnservedDemandReason | null {
  const unmet = args.unmetUnits ?? 0;
  if (!(unmet > 0)) return null;
  const offered = args.offered ?? 0;
  if (!(offered > 0)) return "not_offered";
  const taken = Math.max(0, args.soldOutside ?? 0) + Math.max(0, args.ownSites ?? 0);
  if (taken >= offered * TAKEN_ENOUGH_SHARE) return "sold_out";
  const recorded = recordedReason(args.unservedBy);
  if (recorded) return recorded;
  return args.unsold?.reason === "ask_above_market" ? "ask_above_buyers" : "not_reached";
}

/** The reason carrying the most unfilled buyer units; ties go to the one nearest a sale. */
function recordedReason(
  by: Partial<Record<OfferMissReason, number>> | null | undefined
): UnservedDemandReason | null {
  if (!by) return null;
  let top: OfferMissReason | null = null;
  for (const reason of OFFER_MISS_PRIORITY) {
    const units = by[reason] ?? 0;
    if (units > 0 && (top == null || units > (by[top] ?? 0))) top = reason;
  }
  switch (top) {
    case "price_above_limit":
      return "ask_above_buyers";
    case "not_eligible":
      return "buyers_not_eligible";
    case "buyer_budget":
      return "buyers_out_of_funds";
    case "not_delivered":
      return "not_reached";
    default:
      return null;
  }
}

export const UNSERVED_DEMAND_TEXT: Record<UnservedDemandReason, string> = {
  sold_out: "You sold everything you offered. Buyers wanted more than your plants made.",
  ask_above_buyers:
    "Part of your offer went unsold because buyers paid less than your asking price.",
  not_reached:
    "Part of your offer went unsold at a competitive price. The open orders are with buyers your freight and trade routes did not reach.",
  not_offered: "You offered none of this last turn.",
  buyers_not_eligible:
    "Part of your offer went unsold. The open orders are with buyers who cannot buy from you because of trade routes, embargoes or tariffs.",
  buyers_out_of_funds:
    "Part of your offer went unsold. The open orders are with buyers whose funds ran out before they reached your offer.",
};
