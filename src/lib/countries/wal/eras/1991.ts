import type { CountryEraOverride } from "../../contract";

/**
 * WAL, 1991.
 *
 * GENERATED from `__snapshots__/wal.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts WAL --force
 *
 * DIFFERENCES ONLY: fields not named here fall back to base modules.
 * `config` is ABSENT, not `{}`, because `getCountryConfig` merges shallowly
 * and `config: {}` registers as a supplying-nothing override.
 */
export const WAL_1991: CountryEraOverride = {
  preset: "1991-default",
};
