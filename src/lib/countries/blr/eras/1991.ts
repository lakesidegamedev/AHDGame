import type { CountryEraOverride } from "../../contract";

/**
 * BLR, 1991.
 *
 * GENERATED from `__snapshots__/blr.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts BLR --force
 *
 * DIFFERENCES ONLY: unlisted fields come from base modules.
 *
 * No `config` override: the field is ABSENT, not `{}`, because
 * `getCountryConfig` merges shallowly and `{}` reads as an override supplying
 * nothing.
 */
export const BLR_1991: CountryEraOverride = {
  preset: "1991-default",
};
