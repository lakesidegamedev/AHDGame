import { liveChangeVsPreviousClose } from "@/lib/stockExchange/quoteChange";

/** A private corporation has no market, so its payload carries no quote, change or price history. */
export function corpNavMarketFields(
  corp: { sharePrice: number; isPrivate?: boolean },
  historyDocs: { sharePrice: number }[],
  includeCorpMarket: boolean
): { isPrivate: true } | { sharePrice: number; priceChange1h?: number } {
  if (corp.isPrivate) return { isPrivate: true };
  return {
    sharePrice: corp.sharePrice,
    ...(includeCorpMarket && historyDocs.length >= 2
      ? { priceChange1h: liveChangeVsPreviousClose(corp.sharePrice, historyDocs) }
      : {}),
  };
}

export function withoutSharePrice<T extends { sharePrice?: number }>(
  row: T
): Omit<T, "sharePrice"> {
  const { sharePrice: _omit, ...rest } = row;
  return rest;
}
