import type { CountryEraOverride } from "../../contract";

/*
 * UK, 2027. GENERATED from `__snapshots__/uk.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts UK --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules. `config` is
 * absent rather than {} because `getCountryConfig` merges shallowly and {} reads
 * as an override supplying nothing.
 */
export const UK_2027: CountryEraOverride = {
  preset: "2027-default",
};
