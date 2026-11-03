import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { getEraAwareCurrencySymbol, type CurrencyCode } from "@/lib/constants/currencyCodes";
import { validDisplayRate } from "@/lib/currency/rules/display";

type RateMap = Partial<Record<CurrencyCode, number>>;

/**
 * Resolve (display value, symbol) for force-formatting an internal amount in a
 * specific currency, ignoring the viewer's `displayCurrencyPreference`.
 *
 * Used by economy-anchored displays (sector market size, regional GDP totals)
 * where the underlying number represents an economy — not a wallet — and
 * should not wobble turn-over-turn with forex drift on the viewer's preferred
 * currency.
 *
 * When live rates are unavailable (forex disabled or pre-load) or the
 * requested currency has no rate entry, `baselineRates` supplies the era's
 * baseline rate so the amount still reads in local units. That map is built
 * server-side (see `baselineRates.ts`); importing the country configs here
 * would put every country's client config in the bundle for a fallback label.
 *
 * The anchor symbol is an internal convention and is never shown player-facing.
 */
export function resolveForcedDisplay(
  internalAmount: number,
  currencyCode: CurrencyCode,
  rates: RateMap | null,
  /** Active world preset, so historical denominations and symbols are era-correct. */
  preset?: string,
  eurozoneEnabled = false,
  baselineRates?: RateMap
): { value: number; symbol: string } {
  const rate = rates?.[currencyCode] ?? baselineRates?.[currencyCode];
  if (!validDisplayRate(rate)) {
    // Unknown currency with no baseline either — last-resort anchor passthrough.
    return { value: internalAmount, symbol: "₳" };
  }
  return {
    value: internalAmount * rate,
    symbol: getEraAwareCurrencySymbol(currencyCode, preset ?? DEFAULT_SEED_PRESET, eurozoneEnabled),
  };
}
