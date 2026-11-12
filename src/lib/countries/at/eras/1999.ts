import type { CountryEraOverride } from "../../contract";

/*
 * AT, 1999.
 *
 * GENERATED from `__snapshots__/at.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts AT --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * Config field is ABSENT rather than an empty object, because
 * `getCountryConfig` merges shallowly and `config: {}` reads as an override
 * that supplies nothing.
 *
 * No per-era orders of battle: falls back to the base set.
 */
export const AT_1999: CountryEraOverride = {
  preset: "1999-default",
};
