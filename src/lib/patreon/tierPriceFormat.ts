import type { PatreonTier } from "@/lib/db/types";

// Client-safe half of tierPrices.ts: the tier keys, the fallback price list
// (as of 2026-10-27) and how a price is written.

export type PaidPatreonTier = Exclude<PatreonTier, null>;

export interface PatreonTierPrice {
  key: PaidPatreonTier;
  title: string;
  amountCents: number;
  currency: "USD";
  /** e.g. "$3.00 / month" */
  priceLabel: string;
}

export const FALLBACK_TIER_PRICES: Record<PaidPatreonTier, { title: string; amountCents: number }> =
  {
    supporter: { title: "Supporter", amountCents: 300 },
    "supporter-plus": { title: "Supporter+", amountCents: 999 },
    "supporter-plus-plus": { title: "Champion", amountCents: 2000 },
  };

export function formatMonthlyPrice(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)} / month`;
}
