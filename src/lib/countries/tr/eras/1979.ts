import type { CountryEraOverride } from "../../contract";

/**
 * TR, 1979.
 *
 * GENERATED. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts TR --force
 *
 * DIFFERENCES ONLY. Unnamed fields come from base modules.
 *
 * No config override: field is ABSENT, not `{}`, because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override supplying nothing.
 *
 * No per-era orders of battle: falls back to the base set.
 */
export const TR_1979: CountryEraOverride = {
  preset: "1979-default",
};
