import type { CountryId } from "@/lib/constants/countriesCore";
import { isCountryId } from "@/lib/country/countryIds";

/**
 * Validate a country code from a URL or query string against every configured
 * country (including runtime-activated SCO/WAL). Returns null for anything
 * unknown so callers fall back deliberately instead of matching a wrong id.
 */
export function parseCountryParam(param: string | null): CountryId | null {
  if (!param) return null;
  return isCountryId(param) ? (param.toUpperCase() as CountryId) : null;
}
