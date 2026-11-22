/** Why paid orders stayed unfilled although the company offered the product, from settlement only. */
import type { UnsoldReading } from "./unsoldReason";

export type UnservedDemandReason = "sold_out" | "ask_above_buyers" | "not_reached" | "not_offered";

/** Offered units counted as fully taken at or above this share. */
export const TAKEN_ENOUGH_SHARE = 0.99;

export function unservedDemandReason(args: {
  unmetUnits: number | null | undefined;
  offered: number | null | undefined;
  soldOutside: number | null | undefined;
  ownSites: number | null | undefined;
  unsold?: UnsoldReading | null;
}): UnservedDemandReason | null {
  const unmet = args.unmetUnits ?? 0;
  if (!(unmet > 0)) return null;
  const offered = args.offered ?? 0;
  if (!(offered > 0)) return "not_offered";
  const taken = Math.max(0, args.soldOutside ?? 0) + Math.max(0, args.ownSites ?? 0);
  if (taken >= offered * TAKEN_ENOUGH_SHARE) return "sold_out";
  return args.unsold?.reason === "ask_above_market" ? "ask_above_buyers" : "not_reached";
}

export const UNSERVED_DEMAND_TEXT: Record<UnservedDemandReason, string> = {
  sold_out: "You sold everything you offered. Buyers wanted more than your plants made.",
  ask_above_buyers:
    "Part of your offer went unsold because buyers paid less than your asking price.",
  not_reached:
    "Part of your offer went unsold at a competitive price. The open orders are with buyers your freight and trade routes did not reach.",
  not_offered: "You offered none of this last turn.",
};
