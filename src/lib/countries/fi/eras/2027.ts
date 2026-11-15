import type { CountryEraOverride } from "../../contract";

/**
 * FI, 2027. Differences only from base modules.
 *
 * Generated from `__snapshots__/fi.pre-move.json`. Regenerate with:
 *     npx tsx scripts/countries/gen-country-eras.ts FI --force
 *
 * ⚠️ `usdExchangeRate` must be set: the base value (0.256) is per-markka,
 * but 2027 seeds FI budgets in EUR. Scale by the authored cross rate:
 * 0.256 x 3.9 (FIM/anchor) / 0.92 (EUR/anchor), matching
 * `seedExchangeRates`. Left unset, anchor normalization and the seeded EUR
 * budget disagree ~4.2x.
 */
export const FI_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    usdExchangeRate: 1.085217391304348,
  },
};
