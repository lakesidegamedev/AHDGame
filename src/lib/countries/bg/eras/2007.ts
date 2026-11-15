import type { CountryEraOverride } from "../../contract";

/**
 * BG, 2007.
 *
 * GENERATED from `__snapshots__/bg.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts BG --force
 *
 * DIFFERENCES ONLY: unlisted fields come from base modules.
 *
 * No `config` override: the field is ABSENT, not `{}`, because
 * `getCountryConfig` merges shallowly and `{}` reads as an override supplying
 * nothing.
 */
export const BG_2007: CountryEraOverride = {
  preset: "2007-default",
};
