import type { CountryEraOverride } from "../../contract";

/**
 * US, 2027.
 *
 * GENERATED from `__snapshots__/us.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts US --force
 *
 * DIFFERENCES ONLY: fields not named here fall back to base modules.
 * `config` is ABSENT, not `{}`, because `getCountryConfig` merges shallowly
 * and `config: {}` registers as a supplying-nothing override.
 */
export const US_2027: CountryEraOverride = {
  preset: "2027-default",
};
