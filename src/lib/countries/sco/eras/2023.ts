import type { CountryEraOverride } from "../../contract";

/**
 * SCO, 2023.
 *
 * GENERATED. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts SCO --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules.
 *
 * No config override: the field is ABSENT rather than `{}` because
 * `getCountryConfig` merges shallowly and `config: {}` reads as an override
 * that supplies nothing.
 */
export const SCO_2023: CountryEraOverride = {
  preset: "2023-default",
};
