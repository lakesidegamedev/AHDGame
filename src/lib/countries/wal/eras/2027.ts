import type { CountryEraOverride } from "../../contract";

/**
 * WAL, 2027. GENERATED from __snapshots__/wal.pre-move.json.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts WAL --force
 *
 * DIFFERENCES ONLY. Omitted fields fall back to base modules.
 * No config: absent rather than {}, since getCountryConfig merges shallowly
 * and config: {} reads as an empty override.
 */
export const WAL_2027: CountryEraOverride = {
  preset: "2027-default",
};
