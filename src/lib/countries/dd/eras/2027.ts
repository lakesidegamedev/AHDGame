import type { CountryEraOverride } from "../../contract";

/**
 * DD, 2027.
 *
 * GENERATED from `__snapshots__/dd.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts DD --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * config must stay ABSENT, not `{}`: `getCountryConfig` merges shallowly, so
 * `config: {}` reads as an override that supplies nothing.
 *
 * ordersOfBattle falls back to the base set; do not add an empty one.
 */
export const DD_2027: CountryEraOverride = {
  preset: "2027-default",
};
