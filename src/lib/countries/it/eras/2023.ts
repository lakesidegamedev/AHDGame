import type { CountryEraOverride } from "../../contract";

/**
 * IT, 2023.
 *
 * GENERATED from `__snapshots__/it.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts IT --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * No config override: the field is ABSENT rather than an empty object, because
 * `getCountryConfig` merges shallowly and `config: {}` reads as an override that
 * supplies nothing. Likewise no per-era orders of battle: fall back to the base set.
 */
export const IT_2023: CountryEraOverride = {
  preset: "2023-default",
};
