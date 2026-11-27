/**
 * Capacity already spoken for in a market, so unmet demand is read net of it.
 *
 * The measured gap (demand less supply) only moves when plants come online, so
 * capacity that is ordered but not yet running, or founded earlier in the same
 * pass, would otherwise be built into again. Claims are keyed per bucket for
 * regional service lanes, whose gap is a per-region figure, and per country and
 * lane for every other lane, whose gap is national and would be counted again
 * in every region. Extraction lanes are also keyed by recipe, because a gas
 * well's queue does not answer a timber gap.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import {
  isCountryBookCommodity,
  isStateScopedCommodity,
} from "@/lib/market/rules/commodityMarketScope";

/**
 * Whether every output a sector sells is a regional-book service, whose gap is
 * measured per region (healthcare, real estate). A mixed sector (logistics
 * sells freight and consulting) has a national leg, and freight and
 * construction services sell anywhere in their own country, so their gap and
 * their claims are national.
 */
export function isRegionalBookSupplyMix(
  supplyMix: Partial<Record<CommodityType, number>>
): boolean {
  let legs = 0;
  for (const [commodity, rate] of Object.entries(supplyMix) as [CommodityType, number][]) {
    if (!(rate > 0)) continue;
    if (!isStateScopedCommodity(commodity) || isCountryBookCommodity(commodity)) return false;
    legs += 1;
  }
  return legs > 0;
}

/** Unmet demand less the capacity claimed against it. An unreadable gap stays unreadable. */
export function netUnmetDemandUnits(
  unmetUnits: number | null,
  claimedUnits: number | undefined
): number | null {
  if (unmetUnits == null || !Number.isFinite(unmetUnits)) return null;
  const claimed =
    claimedUnits !== undefined && Number.isFinite(claimedUnits) ? Math.max(0, claimedUnits) : 0;
  return Math.max(0, unmetUnits - claimed);
}

/** Add `units` to a claim ledger; non-positive or non-finite amounts are ignored. */
export function addDemandClaim(claims: Map<string, number>, key: string, units: number): void {
  if (!Number.isFinite(units) || units <= 0) return;
  claims.set(key, (claims.get(key) ?? 0) + units);
}
