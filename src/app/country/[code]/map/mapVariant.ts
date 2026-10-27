import { COUNTRY_DISPLAY_LABELS } from "@/lib/constants/countryDisplayLabels";
import type { CountryId } from "@/lib/constants/countriesCore";

/**
 * Countries that render through the shared parliamentary map. US is separate
 * because it carries electoral-college math and a presidential results panel;
 * every other country falls through to the economy-only placeholder.
 */
export type ParliamentaryMapCountryId = "UK" | "DE" | "JP" | "CN" | "BR" | "NG";

const PARLIAMENTARY_MAP_COUNTRIES: ReadonlySet<string> = new Set<ParliamentaryMapCountryId>([
  "UK",
  "DE",
  "JP",
  "CN",
  "BR",
  "NG",
]);

export function isParliamentaryMapCountry(id: string): id is ParliamentaryMapCountryId {
  return PARLIAMENTARY_MAP_COUNTRIES.has(id);
}

export type CountryMapVariant = "us" | "parliamentary" | "econOnly";

export function mapVariantFor(countryId: CountryId): CountryMapVariant {
  if (countryId === COUNTRY_DISPLAY_LABELS.US.id) return "us";
  return isParliamentaryMapCountry(countryId) ? "parliamentary" : "econOnly";
}
