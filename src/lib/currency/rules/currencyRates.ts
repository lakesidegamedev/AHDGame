import type { CountryId } from "@/lib/constants/countries";
import {
  STARTING_YEAR,
  getStartingYearForPreset,
  type SeedPresetId,
} from "@/lib/constants/turnTime";
import { missingPresetEntry } from "@/lib/seeds/contract/seedContractError";
import { dataPresetFor } from "@/lib/seeds/presetSelector";
import { isEuroAdopted } from "@/lib/currency/rules/euroAdoption";
import { isRubleAdopted } from "@/lib/currency/rules/rubleTransition";
import {
  CURRENCY_ANCHOR_COUNTRY,
  COUNTRY_CURRENCY_MAP,
  type CurrencyCode,
} from "@/lib/constants/currencyCodes";
import {
  FOREX_SPREAD_STRENGTH_DEFAULT,
  FOREX_SPREAD_STRENGTH_MAX,
  FOREX_SPREAD_STRENGTH_MIN,
  INITIAL_RATES,
  INITIAL_RATES_1953,
  INITIAL_RATES_1979,
  INITIAL_RATES_1991,
  INITIAL_RATES_BY_PRESET,
  RESERVE_CURRENCY_VOLATILITY_REDUCTIONS,
} from "@/lib/constants/currenciesTables";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

/**
 * The single country that "anchors" each currency — i.e. the one whose
 * `exchangeRates` doc holds the live rate and central bank for that currency.
 *
 * This is authoritative and EXPLICIT (not derived from `COUNTRY_CURRENCY_MAP`
 * iteration order). EUR is DE-only (West German DM proxy pre-eurozone; euro
 * after). IEP is IE-only. SCO/WAL share GBP with UK as the anchor.
 *
 * CAD has no launched country, so it resolves to US (USD parity) — matching the
 * legacy fallback.
 */
/**
 * The country whose central bank / exchange-rate doc backs a currency.
 * National prime rate / savings APY / FX rate lookups use this (one country per
 * currency). See {@link CURRENCY_ANCHOR_COUNTRY}.
 */
export function getCountryIdForCurrency(code: CurrencyCode): CountryId {
  return CURRENCY_ANCHOR_COUNTRY[code] ?? "US";
}

/** Clamp a raw spread-strength to the allowed band; non-finite → default. */
export function clampForexSpreadStrength(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return FOREX_SPREAD_STRENGTH_DEFAULT;
  return Math.min(FOREX_SPREAD_STRENGTH_MAX, Math.max(FOREX_SPREAD_STRENGTH_MIN, value));
}

/** Noise multiplier for a reserve currency at `rank` (1-indexed). 1 = no buff. */
export function reserveCurrencyVolatilityMultiplier(rank: number): number {
  const reduction = RESERVE_CURRENCY_VOLATILITY_REDUCTIONS[rank - 1] ?? 0;
  return 1 - reduction;
}

/**
 * Seed-time starting rates for a preset. Throws `SeedContractError` when the
 * preset has no authored table: rates are never interpolated or borrowed.
 */
export function getInitialRates(preset: string): Partial<Record<CountryId, number>> {
  const rates = INITIAL_RATES_BY_PRESET[dataPresetFor(preset) as SeedPresetId];
  if (!rates) throw missingPresetEntry(preset, "fxRates");
  return rates;
}

/**
 * Starting-rate anchors for a world that is already running. Never throws, so
 * an existing world on a preset without an authored table keeps turning: it
 * reads the authored table when there is one, else the year-interpolated
 * anchors. Turn code only; seeding uses `getInitialRates`.
 */
export function getRuntimeInitialRates(preset?: string): Partial<Record<CountryId, number>> {
  const rates = preset ? INITIAL_RATES_BY_PRESET[dataPresetFor(preset) as SeedPresetId] : undefined;
  if (rates) return rates;
  const year = preset ? getStartingYearForPreset(preset) : STARTING_YEAR;
  return year === STARTING_YEAR ? INITIAL_RATES : getInitialRatesForYear(year);
}

/**
 * Authored exchange-rate anchors, ascending by year.
 *
 * Built on CALL, not at module load. `STARTING_YEAR` comes from `turnTime`,
 * which some suites mock; evaluating it in a module-level const made importing
 * this file throw whenever that mock was in place (it took out
 * `centralBankChairSelection.test.ts`). Resolving inside the function keeps the
 * import graph inert.
 */
function rateAnchors(): ReadonlyArray<{ year: number; rates: Partial<Record<CountryId, number>> }> {
  return [
    { year: 1953, rates: INITIAL_RATES_1953 },
    { year: 1979, rates: INITIAL_RATES_1979 },
    { year: 1991, rates: INITIAL_RATES_1991 },
    { year: STARTING_YEAR, rates: INITIAL_RATES },
  ];
}

/**
 * Seed exchange rates for an arbitrary year, geometrically interpolated
 * between the authored anchors above.
 *
 * GEOMETRIC, not linear: exchange rates compound proportionally, so straight
 * line interpolation is off by an order of magnitude for fast-devaluing
 * currencies.
 *
 * Anchors return their own tables unchanged (byte-identical), and years past
 * the last anchor clamp to it rather than extrapolate.
 */
export function getInitialRatesForYear(year: number): Partial<Record<CountryId, number>> {
  if (!Number.isFinite(year)) return INITIAL_RATES;
  const anchors = rateAnchors();
  const exact = anchors.find((a) => a.year === year);
  if (exact) return exact.rates;
  if (year <= anchors[0].year) return anchors[0].rates;
  const last = anchors[anchors.length - 1];
  if (year >= last.year) return last.rates;

  let lo = anchors[0];
  let hi = last;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (year >= anchors[i].year && year <= anchors[i + 1].year) {
      lo = anchors[i];
      hi = anchors[i + 1];
      break;
    }
  }
  const t = (year - lo.year) / (hi.year - lo.year);
  const out: Partial<Record<CountryId, number>> = {};
  const ids = new Set<string>([...Object.keys(lo.rates), ...Object.keys(hi.rates)]);
  for (const id of ids) {
    const key = id as CountryId;
    const a = lo.rates[key];
    const b = hi.rates[key];
    // A country present in only one anchor keeps that anchor's rate rather than
    // being dropped: a missing entry means "not authored", not "no currency".
    if (a == null || a <= 0) {
      if (b != null) out[key] = b;
      continue;
    }
    if (b == null || b <= 0) {
      out[key] = a;
      continue;
    }
    out[key] = Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
  }
  return out;
}

/**
 * Seed-time hard peg for exchange-rate docs. When set, `processForexTurn`
 * holds the rate fixed (skips macro drift / intervention) until cleared.
 *
 * IE 1953: Irish pound at Bretton Woods par, legally 1:1 with sterling from the
 * 1927 Currency Act through EMS entry in March 1979 (Currency Commission, then
 * Central Bank of Ireland from 1943). A fixed hardPeg at the seeded GBP-par
 * rate models that link under Bretton Woods (both currencies dollar-pegged at
 * the same par). Live tracking of GBP if sterling later drifts is a follow-up.
 */
export function getSeedHardPeg(countryId: CountryId, preset: string): number | undefined {
  if (preset === "1953-default" && countryHasFeature("ieLib", countryId)) {
    return INITIAL_RATES_1953.IE;
  }
  return undefined;
}

/**
 * Seed-time home currency for a country in a preset. Era-blind
 * {@link COUNTRY_CURRENCY_MAP} stays the identity source for every other era;
 * only a 2027-default bootstrap resolves euro members to EUR (see
 * `isEuroAdopted`), RU to RUB, PL to PLN, RO to RON and TR to TRY (2027
 * only). Every other country and every other preset pass through unchanged,
 * so 1991 behavior is byte-identical.
 */
export function getSeedCurrencyCode(countryId: CountryId, preset: string): CurrencyCode {
  if (isEuroAdopted(countryId, preset)) return "EUR";
  if (isRubleAdopted(countryId, preset)) return "RUB";
  if (
    (preset === "2019-default" || preset === "2027-default") &&
    countryHasFeature("plLib", countryId)
  )
    return "PLN";
  if (
    (preset === "2019-default" || preset === "2027-default") &&
    countryHasFeature("roLib", countryId)
  )
    return "RON";
  if (preset === "2027-default" && countryHasFeature("trLib", countryId)) return "TRY";
  if (preset === "2019-default" && countryHasFeature("bgLib", countryId)) return "BGN";
  return COUNTRY_CURRENCY_MAP[countryId];
}

/**
 * Authored era rate for a currency (local units per ₳), independent of
 * whether `exchangeRates` has a row for it.
 *
 * "Has a currency code" and "has an exchange-rate row" are different sets:
 * some countries (budget-only economies) never get a rate row, so FX helpers
 * that branch on the code fell through to 1.0 and overstated revenue badly.
 * The authored era rate is the correct answer.
 *
 * Returns `undefined` for unknown codes so callers keep their own fallback.
 */
export function eraRateForCurrency(
  code: CurrencyCode | undefined,
  preset: string | undefined
): number | undefined {
  if (!code) return undefined;
  const eraRates = getRuntimeInitialRates(preset);
  // Modern codes have no era-blind COUNTRY_CURRENCY_MAP entry; that map keeps
  // each predecessor's Cold War/1991 identity. PLN/RON are valid only in 2027.
  if (
    (code === "PLN" || code === "RON" || code === "BGN") &&
    preset !== "2019-default" &&
    preset !== "2027-default"
  )
    return undefined;
  if (code === "BGN" && preset !== "2019-default") return undefined;
  if (code === "TRY" && preset !== "2027-default") return undefined;
  if (code === "RUB" || code === "PLN" || code === "RON" || code === "BGN" || code === "TRY") {
    const countryId = CURRENCY_ANCHOR_COUNTRY[code];
    const rate = eraRates[countryId] ?? INITIAL_RATES[countryId];
    return rate !== undefined && rate > 0 ? rate : undefined;
  }
  for (const [countryId, assigned] of Object.entries(COUNTRY_CURRENCY_MAP)) {
    if (assigned !== code) continue;
    const rate = eraRates[countryId as CountryId] ?? INITIAL_RATES[countryId as CountryId];
    if (rate !== undefined && rate > 0) return rate;
  }
  return undefined;
}
