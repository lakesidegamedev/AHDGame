import type { CountryEraOverride } from "../../contract";

/**
 * HU, 2019. GENERATED from `__snapshots__/hu.pre-move.json`.
 * Regenerate: npx tsx scripts/countries/gen-country-eras.ts HU --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 * `config` is omitted deliberately: `getCountryConfig` merges shallowly, so
 * `config: {}` would read as an override supplying nothing. Orders of battle
 * fall back to the base set.
 */
export const HU_2019: CountryEraOverride = {
  preset: "2019-default",
};
