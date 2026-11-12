import type { CountryEraOverride } from "../../contract";

/**
 * SE, 2007.
 *
 * GENERATED. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts SE --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules.
 *
 * No config override: the field is ABSENT rather than `{}` because
 * `getCountryConfig` merges shallowly and `config: {}` reads as an override
 * that supplies nothing.
 */
export const SE_2007: CountryEraOverride = {
  preset: "2007-default",
};
