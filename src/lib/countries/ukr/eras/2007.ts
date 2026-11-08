import type { CountryEraOverride } from "../../contract";

/*
 * UKR, 2007. GENERATED from `__snapshots__/ukr.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts UKR --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules. `config` is
 * absent rather than {} because `getCountryConfig` merges shallowly and {} reads
 * as an override supplying nothing.
 */
export const UKR_2007: CountryEraOverride = {
  preset: "2007-default",
};
