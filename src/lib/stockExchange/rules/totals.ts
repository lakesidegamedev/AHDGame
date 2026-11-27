import type { ExchangeListingSlice, ExchangeTotals } from "../aggregate";

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const anchored = (anchor: number | null | undefined, local: number | null | undefined): number =>
  finite(anchor) ?? finite(local) ?? 0;

/**
 * Return of today's constituent basket held throughout the period. Reconstruct
 * starting weights from cap / (1 + return), rather than weighting winners by
 * their ending size. This is a price basket, not an issuance-adjusted index.
 */
export function aggregateExchangeTotals(listings: ExchangeListingSlice[]): ExchangeTotals {
  const changes = (["priceChange1h", "priceChange24h", "priceChange48h"] as const).map((key) => {
    let start = 0;
    let end = 0;
    for (const listing of listings) {
      const cap = anchored(listing.marketCapAnchor, listing.marketCap);
      const change = finite(listing[key]);
      if (cap <= 0 || change == null || change <= -100) continue;
      start += cap / (1 + change / 100);
      end += cap;
    }
    return start > 0 ? ((end - start) / start) * 100 : 0;
  });
  return {
    marketCap: listings.reduce((sum, l) => sum + anchored(l.marketCapAnchor, l.marketCap), 0),
    revenue: listings.some((l) => l.totalRevenue === null || l.totalRevenueAnchor === null)
      ? null
      : listings.reduce((sum, l) => sum + anchored(l.totalRevenueAnchor, l.totalRevenue), 0),
    income: listings.some((l) => l.income === null || l.incomeAnchor === null)
      ? null
      : listings.reduce((sum, l) => sum + anchored(l.incomeAnchor, l.income), 0),
    weightedChange1h: changes[0],
    weightedChange24h: changes[1],
    weightedChange48h: changes[2],
  };
}
