import type { CountryId } from "@/lib/constants/countriesCore";

/**
 * The short display code for each country ("GB" for the United Kingdom).
 *
 * The approval page prints this label next to its title and builds a country
 * link from it. Reading it from `countryClientConfig` pulled the whole 154 KB
 * projected config (chambers, office types, currency, routes) into that page's
 * chunk for one string. `countryCodes.test.ts` pins every entry to
 * `COUNTRY_CLIENT_CONFIGS`.
 */
const COUNTRY_CODES: Record<CountryId, string> = {
  US: "US",
  UK: "GB",
  DE: "DE",
  JP: "JP",
  IE: "IE",
  SCO: "SCO",
  WAL: "WAL",
  BR: "BR",
  CN: "CN",
  NG: "NG",
  HU: "HU",
  PL: "PL",
  RO: "RO",
  YU: "YU",
  BG: "BG",
  BLR: "BLR",
  CS: "CS",
  UKR: "UKR",
  BAL: "BAL",
  RU: "RU",
  FR: "FR",
  IT: "IT",
  ES: "ES",
  SE: "SE",
  TR: "TR",
  GR: "GR",
  AT: "AT",
  FI: "FI",
  DD: "DD",
};

/** Short display code for a country, falling back to the id it was given. */
export function getCountryCode(id: CountryId): string {
  return Object.hasOwn(COUNTRY_CODES, id) ? COUNTRY_CODES[id] : id;
}
