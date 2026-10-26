/**
 * Budget display helpers.
 *
 * **Currency (v0.2.6):** Currency figures are intra-country. A country's
 * currency comes from `COUNTRY_CURRENCY_MAP` and its symbol from
 * `CURRENCY_SYMBOLS`, so no cross-country aggregation and no FX conversion
 * happens here.
 */

import { COUNTRY_CURRENCY_MAP, CURRENCY_SYMBOLS } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";

// ── Currency display helpers ─────────────────────────────────────────────────

/**
 * Get the display currency symbol for a country, optionally overridden by an
 * explicit currencyCode. Symbols come from the CURRENCY_SYMBOLS SSOT — a
 * local duplicate table here previously covered only 8 currencies, so every
 * era currency (SUR, FRF, ITL, ESP, SEK, TRL, DDM, the Eastern Bloc set)
 * silently displayed "$".
 */
export function getCurrencyPrefix(
  countryIdOrCurrencyCode?: string,
  explicitCurrencyCode?: string
): string {
  const code =
    explicitCurrencyCode ??
    COUNTRY_CURRENCY_MAP[(countryIdOrCurrencyCode ?? "") as CountryId] ??
    "USD";
  return CURRENCY_SYMBOLS[code as CurrencyCode] ?? "$";
}
