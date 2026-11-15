import type { CountryEraOverride } from "../../contract";

/**
 * PL 2019. Generated: npx tsx scripts/countries/gen-country-eras.ts PL --force
 * Only differences are listed. No config override: the field is absent, not {},
 * because getCountryConfig merges shallowly and config: {} reads as an override.
 */
export const PL_2019: CountryEraOverride = {
  preset: "2019-default",
};
