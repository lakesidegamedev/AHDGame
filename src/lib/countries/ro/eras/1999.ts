import type { CountryEraOverride } from "../../contract";

/**
 * RO 1999. Generated: npx tsx scripts/countries/gen-country-eras.ts RO --force
 * Only differences are listed. No config override: the field is absent, not {},
 * because getCountryConfig merges shallowly and config: {} reads as an override.
 */
export const RO_1999: CountryEraOverride = {
  preset: "1999-default",
};
