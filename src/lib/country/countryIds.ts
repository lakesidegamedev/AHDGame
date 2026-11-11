import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countriesCore";

/**
 * Countries that exist in the registry but are not in COUNTRY_ORDER until a
 * secession actuates them. Kept next to the id guard so client navigation code
 * never has to import the full country client config just to validate an id.
 * `countryIds.test.ts` pins this list to the keys of `COUNTRY_CLIENT_CONFIGS`.
 */
const LATENT_COUNTRY_IDS = ["BLR", "UKR", "BAL", "SCO", "WAL"] as const;

export const COUNTRY_IDS: ReadonlySet<string> = new Set<string>([
  ...COUNTRY_ORDER,
  ...LATENT_COUNTRY_IDS,
]);

/** Case-insensitive check for every configured country id, latent ones included. */
export function isCountryId(raw: string | null | undefined): raw is CountryId {
  if (!raw) return false;
  return COUNTRY_IDS.has(raw.toUpperCase());
}
