/**
 * Canonical eligibility for a tradable stock-exchange listing. Snapshot rows
 * are public, exchange-visible corporations, but state enterprises with no
 * issued shares or float are not tradable and must exit every securities
 * metric while staying visible as firms. The only row-level issuance signal
 * is shares vs float. All consumers import this; do not re-derive the rule.
 */
export interface TradabilitySlice {
  totalShares?: number | null;
  publicFloat?: number | null;
}

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** True when the row describes shares that can actually be issued and traded. */
export function isTradableListing(listing: TradabilitySlice): boolean {
  return finitePositive(listing.totalShares) && finitePositive(listing.publicFloat);
}

/** The current eligible set: every row that passes {@link isTradableListing}. */
export function tradableListings<T extends TradabilitySlice>(listings: T[]): T[] {
  return listings.filter(isTradableListing);
}

/** Ids of the current eligible set, for intersecting retained-window numerators. */
export function tradableListingIds(
  listings: Array<TradabilitySlice & { _id: { toString(): string } }>
): Set<string> {
  const ids = new Set<string>();
  for (const listing of listings) {
    if (isTradableListing(listing)) ids.add(listing._id.toString());
  }
  return ids;
}

/**
 * Clamp a breadth ratio into 0..1. Numerators are already intersected with
 * the eligible set, so clamping is defense in depth, never the correction.
 */
export function clampShare(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/** Finite price-change value or the neutral fallback. Never NaN/Infinity. */
export function finitePriceChange(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
