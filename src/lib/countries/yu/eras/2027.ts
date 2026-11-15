import type { CountryEraOverride } from "../../contract";

/**
 * YU, 2027. GENERATED from `__snapshots__/yu.pre-move.json`; regenerate with
 * `npx tsx scripts/countries/gen-country-eras.ts YU --force`.
 *
 * DIFFERENCES ONLY: everything not named here comes from the base modules.
 *
 * `config` is deliberately ABSENT, not `{}`: `getCountryConfig` merges
 * shallowly, so `config: {}` reads as an override that supplies nothing.
 */
export const YU_2027: CountryEraOverride = {
  preset: "2027-default",
};
