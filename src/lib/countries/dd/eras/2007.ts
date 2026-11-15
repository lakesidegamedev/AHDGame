import type { CountryEraOverride } from "../../contract";

/**
 * DD, 2007. GENERATED from __snapshots__/dd.pre-move.json.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts DD --force
 *
 * DIFFERENCES ONLY. Omitted config and orders of battle fall back to base.
 * config must be ABSENT, not {}: getCountryConfig merges shallowly and {}
 * reads as an override supplying nothing.
 */
export const DD_2007: CountryEraOverride = {
  preset: "2007-default",
};
