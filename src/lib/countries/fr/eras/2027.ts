import type { CountryEraOverride } from "../../contract";

/**
 * FR, 2027. Generated; regenerate with gen-country-eras.ts FR --force.
 * Differences only; everything not named here comes from base modules.
 * No per-era orders of battle: falls back to the base set.
 *
 * `usdExchangeRate` anchors one unit of the seeded currency. Base is per-FRF;
 * 2027 seeds in EUR, so it is scaled by the cross rate: 0.238 x 4.2 / 0.92.
 * Unset, anchor normalization and seeded EUR budget disagree ~4.6x.
 */
export const FR_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    usdExchangeRate: 1.0869565217391304,
  },
};
