import {
  COUNTRY_CLIENT_CONFIGS,
  getCountryClientConfig,
} from "@/lib/constants/countryClientConfig";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import type { CountryId } from "@/lib/constants/countriesCore";

type BaselineRates = Partial<Record<CurrencyCode, number>>;

/**
 * Baseline local-units-per-anchor by currency, derived from each country's
 * `usdExchangeRate` (the anchor trades ≈1:1 with the era's dollar).
 *
 * This is a fallback only: live forex rates always win when loaded. It matters
 * for currencies outside the forex set (the Warsaw-Pact bloc in 1953, for
 * example), whose `exchangeRates` documents never exist.
 *
 * ERA-SCOPED (refs #3778): a 1953 world must not be priced with 2019 rates, so
 * the map is built per preset and cached.
 *
 * Server-side only. Building it needs every country's client config, which is
 * too much data to ship to the browser just to price a few fallback labels;
 * `CurrencyProvider` receives the finished map as a prop instead.
 */
const baselineRatesByPreset = new Map<string, BaselineRates>();

export function buildCurrencyBaselineRates(preset?: string): BaselineRates {
  const key = preset ?? "";
  const cached = baselineRatesByPreset.get(key);
  if (cached) return cached;
  const map: BaselineRates = {};
  for (const countryId of Object.keys(COUNTRY_CLIENT_CONFIGS) as CountryId[]) {
    const config = getCountryClientConfig(countryId, preset);
    if (config?.currencyCode && map[config.currencyCode] === undefined) {
      const anchorPerLocal = config.usdExchangeRate;
      if (anchorPerLocal > 0) map[config.currencyCode] = 1 / anchorPerLocal;
    }
  }
  baselineRatesByPreset.set(key, map);
  return map;
}
