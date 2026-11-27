interface SpreadRecord {
  fromCurrency: string;
  toCurrency: string;
  spread: number;
  rate: number;
}

/** FX fees are charged in the source currency, including on incoming trades. */
export function reserveSeedSpreadSample(
  trades: readonly SpreadRecord[],
  currency: string
): { spread: number; excluded: number } {
  let spread = 0,
    excluded = 0;
  for (const trade of trades) {
    if (!Number.isFinite(trade.spread)) {
      excluded++;
      continue;
    }
    if (trade.spread === 0) continue;
    const amount =
      trade.fromCurrency === currency
        ? trade.spread
        : trade.toCurrency === currency && Number.isFinite(trade.rate) && trade.rate > 0
          ? trade.spread * trade.rate
          : Number.NaN;
    if (!Number.isFinite(amount) || !Number.isFinite(spread + amount)) {
      excluded++;
      continue;
    }
    spread += amount;
  }
  return { spread, excluded };
}
