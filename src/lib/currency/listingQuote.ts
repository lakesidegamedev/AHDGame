import { getEraAwareCurrencySymbol, type CurrencyCode } from "@/lib/constants/currencyCodes";
import { formatSharePrice } from "@/lib/utils/formattersCore";

/**
 * One authoritative share quote: the price a corporation's shares trade at, in
 * the currency of the exchange they list on.
 *
 * Every equity price surface (corporation header, market tape, stocks table,
 * status bar) prints the stored listing-currency price through this function,
 * with no forex round trip. Converting to the anchor and back made the same
 * quote read differently on each surface, because each one converted with a
 * different rate (snapshot time versus live) or a different display preference.
 * Cross-currency sorting keeps using the anchor mirrors; only the printed quote
 * is pinned here.
 *
 * Pure: no context, clock, or rates.
 */
export function formatListingQuote(
  localPrice: number,
  currencyCode: CurrencyCode,
  preset: string,
  eurozoneEnabled: boolean
): string {
  return formatSharePrice(
    localPrice,
    getEraAwareCurrencySymbol(currencyCode, preset, eurozoneEnabled)
  );
}
