import type { CountryEraOverride } from "../../contract";

/**
 * DE, 2007.
 *
 * GENERATED from `__snapshots__/de.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts DE --force
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * config must stay ABSENT, not `{}`: `getCountryConfig` merges shallowly, so
 * `config: {}` reads as an override that supplies nothing.
 *
 * ordersOfBattle falls back to the base set; do not add an empty one.
 */
export const DE_2007: CountryEraOverride = {
  preset: "2007-default",
};
