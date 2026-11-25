/**
 * The market overview shows five rows per card, so it asks the list endpoints
 * for just those rows instead of downloading every listing.
 */

import type { PriceCapBasis } from "./priceCapBasis";
import type { CommodityPriceAttribution } from "./priceAttribution";
import { cappedGoodTarget } from "./cappedGoodTarget";

export const MAX_PREVIEW_ROWS = 20;
export const MARKET_OVERVIEW_ROWS = 5;

export interface CommodityMover {
  commodity: string;
  label: string;
  basePrice: number;
  globalPrice: number;
  priceCeiling?: number;
  priceCapBasis?: PriceCapBasis;
  globalSupply?: number;
  globalDemand?: number;
  priceAttribution?: CommodityPriceAttribution | null;
}

export function vsBasePct({
  basePrice,
  globalPrice,
}: Pick<CommodityMover, "basePrice" | "globalPrice">): number | null {
  return basePrice > 0 ? (globalPrice / basePrice - 1) * 100 : null;
}

/** True when the price sits on the market's price ceiling (within 1%). */
export function atPriceCap({
  globalPrice,
  priceCeiling,
}: {
  globalPrice: number;
  priceCeiling?: number | null;
}): boolean {
  return typeof priceCeiling === "number" && priceCeiling > 0 && globalPrice >= priceCeiling * 0.99;
}

/**
 * Larger first by distance from base. Goods held at the cap share one figure,
 * so ties go to the one whose market target sits furthest above the cap.
 */
export function compareByDistanceFromBase<T extends CommodityMover>(a: T, b: T): number {
  const diff = Math.abs(vsBasePct(b) ?? 0) - Math.abs(vsBasePct(a) ?? 0);
  if (Math.abs(diff) > 0.05) return diff;
  const ta = atPriceCap(a) ? (cappedGoodTarget(a)?.targetVsBasePct ?? 0) : 0;
  const tb = atPriceCap(b) ? (cappedGoodTarget(b)?.targetVsBasePct ?? 0) : 0;
  return tb - ta;
}

/**
 * The commodities card: goods held at the cap all show the same figure, so
 * they share one summary row and the other rows go to the goods furthest
 * from base that can still move. One row fewer when any good is capped.
 */
export function commodityOverview<T extends CommodityMover>(
  commodities: readonly T[]
): { movers: T[]; capped: T[] } {
  const sorted = [...commodities].sort(compareByDistanceFromBase);
  const capped = sorted.filter((c) => atPriceCap(c));
  const free = sorted.filter((c) => !atPriceCap(c));
  return {
    movers: free.slice(0, capped.length > 0 ? MARKET_OVERVIEW_ROWS - 1 : MARKET_OVERVIEW_ROWS),
    capped,
  };
}

/** Plain-words summary of the goods held at the cap, most pressed first. */
export function cappedSummary(capped: readonly { label: string }[]): string | null {
  if (capped.length === 0) return null;
  const names = capped.slice(0, 4).map((c) => c.label);
  const more = capped.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}

/** `?preview=N` as a row count, or null when absent or invalid. */
export function parsePreviewRows(raw: string | null): number | null {
  if (raw === null) return null;
  const rows = Number(raw);
  if (!Number.isInteger(rows) || rows < 1) return null;
  return Math.min(rows, MAX_PREVIEW_ROWS);
}

/** Highest-yield corporate bonds that still have units to buy. */
export function topBondsForPreview<
  T extends {
    issuerType: string;
    defaulted?: boolean;
    publicFloat: number;
    yieldToMaturity: number;
  },
>(bonds: readonly T[], rows: number): T[] {
  return bonds
    .filter((b) => b.issuerType !== "sovereign" && !b.defaulted && b.publicFloat > 0)
    .sort((a, b) => b.yieldToMaturity - a.yieldToMaturity)
    .slice(0, rows);
}

/** Largest listed companies by market cap, anchor-normalised when present. */
export function topStocksForPreview<
  T extends { isNpp?: boolean; marketCap: number; marketCapAnchor?: number },
>(listings: readonly T[], rows: number): T[] {
  return listings
    .filter((l) => !l.isNpp)
    .sort((a, b) => (b.marketCapAnchor ?? b.marketCap) - (a.marketCapAnchor ?? a.marketCap))
    .slice(0, rows);
}
