import type { CountryEraOverride } from "../../contract";

/**
 * UKR, 1953. GENERATED from `__snapshots__/ukr.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts UKR --force
 *
 * DIFFERENCES ONLY: everything not named here comes from the base modules.
 *
 * GDP is authored in Soviet-ruble millions, so its anchor normalizer must
 * match RU, BLR, and BAL rather than UKR's era-neutral base rate.
 *
 * No per-era orders of battle; falls back to the base set.
 */
export const UKR_1953: CountryEraOverride = {
  preset: "1953-default",
  config: {
    usdExchangeRate: 0.1111111111111111,
  },
};
