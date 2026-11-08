import type { CountryEraOverride } from "../../contract";

/**
 * DE, 1979.
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
export const DE_1979: CountryEraOverride = {
  preset: "1979-default",
};
