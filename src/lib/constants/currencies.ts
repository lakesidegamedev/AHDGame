// src/lib/constants/currencies.ts
/**
 * Exchange rates and what moves them (for example GBP to USD). The tables live in
 * `currenciesTables`; the rate-lookup formulas live in `currency/rules/currencyRates`.
 * Only the random regime roll stays here, because it reads `Math.random`.
 */
import { CYCLE_PRESSURE_REGIMES, type CurrencyCyclePressureRegime } from "./currenciesTables";

export * from "./currenciesTables";

export {
  getCountryIdForCurrency,
  clampForexSpreadStrength,
  reserveCurrencyVolatilityMultiplier,
  getInitialRates,
  getRuntimeInitialRates,
  getInitialRatesForYear,
  getSeedHardPeg,
  getSeedCurrencyCode,
  eraRateForCurrency,
} from "@/lib/currency/rules/currencyRates";

/** Pick a uniformly-random regime — called when a currency's 12-turn window rolls over. */
export function rollCyclePressureRegime(): CurrencyCyclePressureRegime {
  return CYCLE_PRESSURE_REGIMES[Math.floor(Math.random() * CYCLE_PRESSURE_REGIMES.length)];
}
