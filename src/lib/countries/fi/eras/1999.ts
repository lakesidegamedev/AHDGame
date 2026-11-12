import type { CountryEraOverride } from "../../contract";

/**
 * GENERATED from __snapshots__/fi.pre-move.json.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts FI --force
 * DIFFERENCES ONLY. Unnamed fields come from base modules.
 * config is ABSENT, not {}, because getCountryConfig merges shallowly
 * and {} would read as an override supplying nothing.
 * No order of battle override: falls back to base set.
 */
export const FI_1999: CountryEraOverride = {
  preset: "1999-default",
};
