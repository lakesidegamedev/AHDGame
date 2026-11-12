import type { CountryEraOverride } from "../../contract";

/**
 * IE, 1999. GENERATED from `__snapshots__/ie.pre-move.json`.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts IE --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 * `config` is omitted deliberately: `getCountryConfig` merges shallowly, so
 * `config: {}` would read as an override supplying nothing. Orders of battle
 * fall back to the base set.
 */
export const IE_1999: CountryEraOverride = {
  preset: "1999-default",
};
