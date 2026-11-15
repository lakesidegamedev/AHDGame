/** Pure rules for exchangeRegistry; the tables they read live in exchangeRegistryTables. */
import type { CountryId } from "@/lib/constants/countriesCore";
import { ALL_EXCHANGES, BY_API_KEY, BY_COUNTRY } from "@/lib/constants/exchangeRegistryTables";

// ── Lookup helpers ──────────────────────────────────────────────────────────

/** Get the display exchange name for a country. Returns undefined if country has no exchange. */
export function getExchangeForCountry(countryId: string): string | undefined {
  return BY_COUNTRY.get(countryId as CountryId)?.exchangeName;
}

/** Get the lowercase API key for a country's exchange (e.g. "nyse", "nikkei"). */
export function getExchangeApiKey(countryId: string): string | undefined {
  return BY_COUNTRY.get(countryId as CountryId)?.apiKey;
}

/** Reverse lookup: API key → countryId (e.g. "nyse" → "US", "nikkei" → "JP"). */
export function getCountryForExchange(apiKey: string): CountryId | undefined {
  return BY_API_KEY.get(apiKey.toLowerCase())?.countryId;
}

/** Get display label for an exchange, given either a countryId or apiKey. */
export function getExchangeLabel(countryIdOrApiKey: string): string {
  // Try as countryId first
  const byCountry = BY_COUNTRY.get(countryIdOrApiKey as CountryId);
  if (byCountry) return byCountry.exchangeName;
  // Try as apiKey
  const byKey = BY_API_KEY.get(countryIdOrApiKey.toLowerCase());
  if (byKey) return byKey.exchangeName;
  // Fallback
  return countryIdOrApiKey.toUpperCase();
}

/** Get all exchanges as a record suitable for EXCHANGE_NAMES maps: apiKey → displayName. */
export function getExchangeNamesMap(): Record<string, string> {
  const map: Record<string, string> = { global: "Global Markets" };
  for (const e of ALL_EXCHANGES) {
    map[e.apiKey] = e.exchangeName;
  }
  return map;
}

/** Get exchange-to-country mapping: apiKey → countryId. */
export function getExchangeCountryMap(): Record<string, CountryId> {
  const map: Record<string, CountryId> = {};
  for (const e of ALL_EXCHANGES) {
    map[e.apiKey] = e.countryId;
  }
  return map;
}

/**
 * True when the country's (or venue's) listing venue is a command economy's
 * enterprise register rather than a tradable exchange.
 */
export function isStateRegister(countryIdOrApiKey: string): boolean {
  const byCountry = BY_COUNTRY.get(countryIdOrApiKey as CountryId);
  if (byCountry) return byCountry.kind === "stateRegister";
  return BY_API_KEY.get(countryIdOrApiKey.toLowerCase())?.kind === "stateRegister";
}
