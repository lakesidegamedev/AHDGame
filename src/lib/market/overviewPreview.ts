/**
 * The market overview shows five rows per card, so it asks the list endpoints
 * for just those rows instead of downloading every listing.
 */

export const MAX_PREVIEW_ROWS = 20;

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
