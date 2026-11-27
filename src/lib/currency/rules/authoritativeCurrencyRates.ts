import { CURRENCY_ANCHOR_COUNTRY, type CurrencyCode } from "@/lib/constants/currencyCodes";

interface CurrencyQuote {
  _id: string;
  currencyCode: string;
  rate: number;
}

/** Shared currencies use their monetary authority, never cursor order. */
export function authoritativeCurrencyQuotes<T extends CurrencyQuote>(
  rows: readonly T[]
): Map<CurrencyCode, T> {
  const groups = new Map<CurrencyCode, T[]>();
  for (const row of rows) {
    const code = row.currencyCode as CurrencyCode;
    const group = groups.get(code) ?? [];
    group.push(row);
    groups.set(code, group);
  }
  const rates = new Map<CurrencyCode, T>();
  for (const [code, group] of groups) {
    const authority = group.find((row) => row._id === CURRENCY_ANCHOR_COUNTRY[code]);
    const candidates = authority ? [authority] : group;
    const rate = candidates[0].rate;
    // A present but unusable quote must not fall through to an authored valuation.
    rates.set(code, {
      ...candidates[0],
      rate:
        Number.isFinite(rate) && rate > 0 && candidates.every((row) => row.rate === rate)
          ? rate
          : Number.NaN,
    });
  }
  return rates;
}

export function authoritativeCurrencyRates(
  rows: readonly CurrencyQuote[]
): Map<CurrencyCode, number> {
  return new Map([...authoritativeCurrencyQuotes(rows)].map(([code, quote]) => [code, quote.rate]));
}
