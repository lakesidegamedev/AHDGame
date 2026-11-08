import type { CountryEraOverride } from "../../contract";

/**
 * IT, 2027. Generated; regenerate with gen-country-eras.ts IT --force.
 * Differences only; everything not named here comes from base modules.
 * No per-era orders of battle: falls back to the base set.
 *
 * `usdExchangeRate` anchors one unit of the seeded currency. Base is
 * per-lira; 2027 seeds in EUR, so it is scaled by the cross rate:
 * 0.0012 x 833 / 0.92. Unset, anchor normalization and seeded EUR budget
 * disagree ~900x.
 */
export const IT_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    usdExchangeRate: 1.0869565217391304,
  },
};
