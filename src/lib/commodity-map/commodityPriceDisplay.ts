import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { convertFromInternal, formatCurrencyPrecise } from "@/lib/utils/formatters";

export function getCommodityDisplayCurrency(countryId: CountryId): CurrencyCode {
  return COUNTRY_CURRENCY_MAP[countryId] ?? "USD";
}

export function convertCommodityPrice(
  amount: number,
  currencyCode: CurrencyCode,
  forexEnabled: boolean | null,
  exchangeRates?: Partial<Record<CurrencyCode, number>>
): number | null {
  if (forexEnabled == null) return null;
  if (!forexEnabled) return amount;
  return convertFromInternal(amount, currencyCode, exchangeRates);
}

export function formatCommodityPrice(
  amount: number,
  currencyCode: CurrencyCode,
  forexEnabled: boolean | null,
  exchangeRates?: Partial<Record<CurrencyCode, number>>
): string {
  const converted = convertCommodityPrice(amount, currencyCode, forexEnabled, exchangeRates);
  if (converted == null || !Number.isFinite(converted)) return "Price unavailable";
  return formatCurrencyPrecise(converted, currencyCode);
}
