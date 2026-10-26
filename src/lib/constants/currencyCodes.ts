/**
 * Currency identity: codes, symbols, the country → currency map and the small
 * forex lists.
 *
 * This is the part of `currencies.ts` that client surfaces need. The exchange
 * rate tables, macros and economy baselines stay there; importing them into a
 * navbar or status bar pulled 47 KB of seed data into every page.
 *
 * `currencyCodes.test.ts` pins the map and the forex lists to the economy
 * modules and `currencies.ts`, so the two cannot drift.
 */
import type { CountryId } from "./countriesCore";

/**
 * Currency codes for all countries — active and future.
 * Active v1: USD, GBP, JPY. Future: CAD, EUR (added when those countries launch).
 */
export type CurrencyCode =
  | "USD"
  | "GBP"
  | "JPY"
  | "CAD"
  | "EUR"
  | "IEP"
  | "BRL"
  | "CNY"
  | "NGN"
  | "HUF"
  | "PLZ"
  | "ROL"
  | "PLN"
  | "RON"
  | "YUD"
  | "BGL"
  | "BGN"
  | "CSK"
  | "SUR"
  | "RUB"
  | "FRF"
  | "ITL"
  | "ESP"
  | "SEK"
  | "TRL"
  | "GRD"
  | "ATS"
  | "FIM"
  | "DDM";

/** Map country → home currency. Authoritative source for this mapping. */
export const COUNTRY_CURRENCY_MAP: Record<CountryId, CurrencyCode> = {
  US: "USD",
  UK: "GBP",
  JP: "JPY",
  DE: "EUR",
  // Irish pound (Saorstát/IEP). Distinct from EUR so 1953 Bretton Woods par
  // (1:1 GBP) can have its own exchangeRates doc without colliding with DE's DM/EUR rate.
  // Euro displays convert with the EUR rate; the stored IEP denomination stays intact.
  IE: "IEP",
  BR: "BRL",
  CN: "CNY",
  NG: "NGN",
  HU: "HUF",
  PL: "PLZ",
  RO: "ROL",
  YU: "YUD",
  BG: "BGL",
  BLR: "SUR",
  UKR: "SUR",
  CS: "CSK",
  BAL: "SUR",
  RU: "SUR",
  FR: "FRF",
  IT: "ITL",
  ES: "ESP",
  SE: "SEK",
  TR: "TRL",
  GR: "GRD",
  AT: "ATS",
  FI: "FIM",
  DD: "DDM",
  SCO: "GBP", // sterlingized — shares the UK's GBP (anchor stays UK)
  WAL: "GBP", // sterlingized — shares the UK's GBP (anchor stays UK)
};

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
export const CURRENCY_ANCHOR_COUNTRY: Record<CurrencyCode, CountryId> = {
  USD: "US",
  GBP: "UK",
  JPY: "JP",
  CAD: "US", // no launched CAD country; USD-parity fallback
  EUR: "DE",
  IEP: "IE",
  BRL: "BR",
  CNY: "CN",
  NGN: "NG",
  HUF: "HU",
  PLZ: "PL",
  ROL: "RO",
  PLN: "PL",
  RON: "RO",
  YUD: "YU",
  BGL: "BG",
  BGN: "BG",
  CSK: "CS",
  SUR: "RU", // Soviet ruble — anchor is the USSR/Russia entity (shared by RU + BY + BAL)
  RUB: "RU", // Modern Russian ruble — same RU anchor, active only in the 2027 preset (see getSeedCurrencyCode)
  FRF: "FR",
  ITL: "IT",
  ESP: "ES",
  SEK: "SE",
  TRL: "TR",
  GRD: "GR",
  ATS: "AT",
  FIM: "FI",
  DDM: "DD",
};

/**
 * Countries with active forex trading. IE is forex-active with its own IEP rate
 * (historically the Irish pound; sterling-linked 1927–1979). DE anchors EUR.
 * NG is forex-active even though the country is still `coming-soon`: its sovereign
 * bonds already settle in NGN, so the naira must be exchangeable or holders are
 * trapped.
 */
// SU/FR/IT/ES/SE/TR join for the 1979 Cold-War preset (player/economy-enabled
// there). Like NG, they stay forex-active across eras even when their sovereign
// fiscal model is not authored, because holders must still be able to exchange
// their currencies. Central-bank coverage is a separate preset-aware scope; see
// presetMonetaryScope. DD remains here for Cold-War DDM support but is excluded
// from post-reunification central-bank seeding.
export const FOREX_ACTIVE_COUNTRIES: CountryId[] = [
  "US",
  "UK",
  "JP",
  "DE",
  "IE",
  "CN",
  "BR",
  "NG",
  "RU",
  "DD",
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "GR",
  "AT",
  "FI",
];

/** Only currencies that participate in forex */
export const FOREX_ACTIVE_CURRENCIES: CurrencyCode[] = [
  "USD",
  "GBP",
  "JPY",
  "EUR",
  "IEP",
  "CNY",
  "BRL",
  "NGN",
  "SUR",
  "RUB",
  "DDM",
  "FRF",
  "ITL",
  "ESP",
  "SEK",
  "TRL",
  "GRD",
  "ATS",
  "FIM",
  "PLZ",
  "HUF",
  "ROL",
  "BGL",
  "CSK",
  "YUD",
  "PLN",
  "RON",
  "BGN",
];

/** Human-readable currency symbols for display */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  GBP: "£",
  JPY: "¥",
  CAD: "C$",
  EUR: "€",
  IEP: "IR£",
  BRL: "R$",
  CNY: "¥",
  NGN: "₦",
  HUF: "Ft",
  PLZ: "zł",
  ROL: "lei",
  PLN: "zł",
  RON: "lei",
  YUD: "din",
  BGL: "лв",
  BGN: "лв",
  CSK: "Kčs",
  SUR: "руб",
  RUB: "₽",
  FRF: "₣",
  ITL: "₤",
  ESP: "₧",
  SEK: "kr",
  TRL: "₺",
  GRD: "₯",
  ATS: "öS",
  FIM: "mk",
  DDM: "M",
};

/** Presets where the Eurozone currency union had not yet been formed.
 *  EUR did not exist; DE used DM, IE used IEP. */
const PRE_EUROZONE_PRESETS = new Set<string>(["1953-default", "1979-default", "1991-default"]);

/** Presets where Brazil's Real (BRL) had not yet replaced the Cruzeiro.
 *  The Real was introduced 1 July 1994. */
const PRE_REAL_PRESETS = new Set<string>(["1953-default", "1979-default", "1991-default"]);

/**
 * Symbol for an amount already denominated in `code`. A symbol-only call must
 * never relabel IEP as EUR, or normalized EUR/BRL units as marks/cruzeiros.
 * Local historical presentation with amount conversion lives in currency/rules/display.
 */
export function getEraAwareCurrencySymbol(
  code: CurrencyCode,
  preset: string,
  eurozoneEnabled: boolean,
  _anchorCountryId?: CountryId
): string {
  // 1953 stores actual marks; 1979/1991 store EUR-equivalent German units.
  if (code === "EUR" && preset === "1953-default") return "DM";
  if (code === "EUR" && !eurozoneEnabled && PRE_EUROZONE_PRESETS.has(preset)) return "€ eq.";
  // Modern presets seeded IEP as a normalized euro-scale accounting unit.
  if (code === "IEP" && !PRE_EUROZONE_PRESETS.has(preset)) return "€ eq.";
  if (code === "BRL" && preset === "1953-default") return "Cr$";
  if (code === "BRL" && PRE_REAL_PRESETS.has(preset)) return "BRL eq.";
  return CURRENCY_SYMBOLS[code] ?? code;
}
