import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";

/**
 * Client-safe home-currency resolution for corp money display.
 * Prefer `liquidCurrencyCode`; if missing, infer from `countryId`.
 * Do not import corporationCapital here — that module pulls mongodb.
 */
export function resolveCorpDisplayCurrency(opts: {
  liquidCurrencyCode?: string | null;
  countryId?: string | null;
}): CurrencyCode | undefined {
  const raw = opts.liquidCurrencyCode;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    return raw as CurrencyCode;
  }
  if (opts.countryId && opts.countryId in COUNTRY_CURRENCY_MAP) {
    return COUNTRY_CURRENCY_MAP[opts.countryId as keyof typeof COUNTRY_CURRENCY_MAP];
  }
  return undefined;
}
