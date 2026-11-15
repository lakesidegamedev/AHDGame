import type { CountryEraOverride } from "../../contract";

/**
 * AT, 2027. Generated from `__snapshots__/at.pre-move.json`; regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts AT --force
 *
 * Differences only. Everything not named here comes from base modules.
 *
 * `usdExchangeRate` is the anchor value of ONE unit of this country's stored
 * seed currency. The base value (0.075) is per-schilling; 2027 seeds AT budgets
 * in EUR, so it must be scaled by the authored cross rate: 0.075 x 13.4
 * (ATS/anchor) / 0.92 (EUR/anchor). Unset, the anchor normalization and the
 * seeded EUR budget disagree ~14.6x.
 */
export const AT_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    usdExchangeRate: 1.0923913043478262,
  },
};
