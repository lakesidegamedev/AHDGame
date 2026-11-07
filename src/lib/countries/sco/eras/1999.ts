import type { CountryEraOverride } from "../../contract";

/**
 * SCO, 1999. GENERATED, do not edit by hand.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts SCO --force
 *
 * Differences only; unnamed fields fall back to base modules. Keep
 * config and orders of battle absent rather than empty: getCountryConfig
 * merges shallowly, so {} would read as an override that supplies nothing.
 */
export const SCO_1999: CountryEraOverride = {
  preset: "1999-default",
};
