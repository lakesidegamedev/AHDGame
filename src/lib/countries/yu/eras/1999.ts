import type { CountryEraOverride } from "../../contract";

/**
 * YU, 1999. GENERATED from __snapshots__/yu.pre-move.json.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts YU --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules.
 * No config: absent rather than {}, since getCountryConfig merges shallowly
 * and config: {} reads as an empty override.
 */
export const YU_1999: CountryEraOverride = {
  preset: "1999-default",
};
