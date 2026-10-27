import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import { convertFromInternal, formatCurrencyPrecise } from "@/lib/utils/formatters";

export function getCommodityDisplayCurrency(countryId: CountryId): CurrencyCode {
  return COUNTRY_CURRENCY_MAP[countryId] ?? "USD";
}

export function convertCommodityPrice(
  amount: number,
  currencyCode: CurrencyCode,
  forexEnabled: boolean,
  exchangeRates?: Partial<Record<CurrencyCode, number>>
): number {
  if (!forexEnabled) return amount;
  if (!exchangeRates) return amount;
  return convertFromInternal(amount, currencyCode, exchangeRates);
}

export function formatCommodityPrice(
  amount: number,
  currencyCode: CurrencyCode,
  forexEnabled: boolean,
  exchangeRates?: Partial<Record<CurrencyCode, number>>
): string {
  const converted = convertCommodityPrice(amount, currencyCode, forexEnabled, exchangeRates);
  return formatCurrencyPrecise(converted, currencyCode);
}
