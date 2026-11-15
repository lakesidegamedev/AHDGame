import type { CountryEraOverride } from "../../contract";

/**
 * CN, 2027.
 *
 * GENERATED from `__snapshots__/cn.pre-move.json`. Regenerate with:
 *     npx tsx scripts/countries/gen-country-eras.ts CN --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * `config` is absent rather than `{}` because `getCountryConfig` merges
 * shallowly and `config: {}` reads as an override supplying nothing.
 * `ordersOfBattle` is absent so this era falls back to the base set.
 */
export const CN_2027: CountryEraOverride = {
  preset: "2027-default",
};
