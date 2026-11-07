import type { CountryEraOverride } from "../../contract";

/**
 * US, 2023.
 *
 * GENERATED from `__snapshots__/us.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts US --force
 *
 * DIFFERENCES ONLY: fields not named here fall back to base modules.
 * `config` is ABSENT, not `{}`, because `getCountryConfig` merges shallowly
 * and `config: {}` registers as a supplying-nothing override.
 */
export const US_2023: CountryEraOverride = {
  preset: "2023-default",
};
