import { listPatreonTiers, mapMemberTierId } from "@/lib/patreon/members";
import {
  FALLBACK_TIER_PRICES,
  formatMonthlyPrice,
  type PaidPatreonTier,
  type PatreonTierPrice,
} from "@/lib/patreon/tierPriceFormat";

export { FALLBACK_TIER_PRICES, formatMonthlyPrice };
export type { PaidPatreonTier, PatreonTierPrice };

// The paid Patreon tiers at their current price, for anything that quotes a
// price to players (Settings, the Ask drawer, and the Ask service itself).
// Read live from Patreon and cached for an hour; the fallback is the price
// list as of 2026-10-27, used only until the first successful read.

const TTL_MS = 60 * 60 * 1000;
const ORDER: PaidPatreonTier[] = ["supporter", "supporter-plus", "supporter-plus-plus"];

function toList(source: Record<PaidPatreonTier, { title: string; amountCents: number }>) {
  return ORDER.map((key) => ({
    key,
    title: source[key].title,
    amountCents: source[key].amountCents,
    currency: "USD" as const,
    priceLabel: formatMonthlyPrice(source[key].amountCents),
  }));
}

// Route handlers can load this module more than once per process, so the
// cache lives on globalThis.
const CACHE_KEY = "__ahdPatreonTierPrices";
type Cache = { at: number; tiers: PatreonTierPrice[]; inflight: Promise<void> | null };
function cache(): Cache {
  const g = globalThis as unknown as Record<string, Cache | undefined>;
  return (g[CACHE_KEY] ??= { at: 0, tiers: toList(FALLBACK_TIER_PRICES), inflight: null });
}

async function refresh(): Promise<void> {
  const c = cache();
  try {
    const listed = await listPatreonTiers();
    const next = { ...FALLBACK_TIER_PRICES };
    for (const tier of listed) {
      const key = mapMemberTierId(tier.tierId);
      if (key && tier.published && tier.amountCents > 0) {
        next[key] = { title: tier.title || next[key].title, amountCents: tier.amountCents };
      }
    }
    c.tiers = toList(next);
    c.at = Date.now();
  } catch (error) {
    // Keep the last known prices; retry on the next request after a short wait.
    c.at = Date.now() - TTL_MS + 5 * 60 * 1000;
    console.warn("[patreon] tier price refresh failed", error);
  }
}

/** Paid tiers, cheapest first, at their current Patreon price. Never throws. */
export async function getPatreonTierPrices(): Promise<PatreonTierPrice[]> {
  const c = cache();
  if (Date.now() - c.at > TTL_MS) {
    c.inflight ??= refresh().finally(() => {
      c.inflight = null;
    });
    await c.inflight;
  }
  return c.tiers;
}

/** Test hook. */
export function resetPatreonTierPriceCache(): void {
  delete (globalThis as unknown as Record<string, unknown>)[CACHE_KEY];
}
