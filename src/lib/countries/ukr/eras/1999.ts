import type { CountryEraOverride } from "../../contract";

/*
 * UKR, 1999. GENERATED from `__snapshots__/ukr.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts UKR --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules. `config` is
 * absent rather than {} because `getCountryConfig` merges shallowly and {} reads
 * as an override supplying nothing.
 */
export const UKR_1999: CountryEraOverride = {
  preset: "1999-default",
};
