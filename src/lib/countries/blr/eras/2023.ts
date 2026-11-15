import type { CountryEraOverride } from "../../contract";

/**
 * BLR, 2023.
 *
 * GENERATED. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts BLR --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * No config override: the field is ABSENT rather than an empty object,
 * because `getCountryConfig` merges shallowly and `config: {}` reads as an
 * override that supplies nothing.
 *
 * No per-era orders of battle: falls back to the base set.
 */
export const BLR_2023: CountryEraOverride = {
  preset: "2023-default",
};
