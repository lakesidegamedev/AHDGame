import type { CountryEraOverride } from "../../contract";

/**
 * DD, 2023. GENERATED from __snapshots__/dd.pre-move.json.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts DD --force
 *
 * DIFFERENCES ONLY. Omitted config and orders of battle fall back to base.
 * config must be ABSENT, not {}: getCountryConfig merges shallowly and {}
 * reads as an override supplying nothing.
 */
export const DD_2023: CountryEraOverride = {
  preset: "2023-default",
};
