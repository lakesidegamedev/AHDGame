import type { CountryEraOverride } from "../../contract";

/**
 * GR, 2027. Generated; regenerate with gen-country-eras.ts GR --force.
 * Differences only; everything not named here comes from base modules.
 * No per-era orders of battle: falls back to the base set.
 *
 * `usdExchangeRate` anchors one unit of the seeded currency. Base is
 * per-drachma; 2027 seeds in EUR, so it is scaled by the cross rate:
 * 0.027 x 37 / 0.92. Unset, anchor normalization and seeded EUR budget
 * disagree ~40x.
 */
export const GR_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    usdExchangeRate: 1.0858695652173914,
  },
};
