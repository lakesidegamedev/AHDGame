import type { CountryEraOverride } from "../../contract";

/**
 * RU, 2019. GENERATED, do not edit by hand.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts RU --force
 *
 * Differences only; unnamed fields fall back to base modules. Keep
 * config and orders of battle absent rather than empty: getCountryConfig
 * merges shallowly, so {} would read as an override that supplies nothing.
 */
export const RU_2019: CountryEraOverride = {
  preset: "2019-default",
};
