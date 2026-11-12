import type { CountryEraOverride } from "../../contract";

/**
 * CS, 2027.
 *
 * GENERATED from `__snapshots__/cs.pre-move.json`. Regenerate with:
 *     npx tsx scripts/countries/gen-country-eras.ts CS --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * `config` is absent rather than `{}` because `getCountryConfig` merges
 * shallowly and `config: {}` reads as an override supplying nothing.
 * `ordersOfBattle` is absent so this era falls back to the base set.
 */
export const CS_2027: CountryEraOverride = {
  preset: "2027-default",
};
