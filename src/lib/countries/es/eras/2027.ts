import type { CountryEraOverride } from "../../contract";

/**
 * ES, 2027. Differences only from base modules.
 *
 * Generated from `__snapshots__/es.pre-move.json`. Regenerate with:
 *     npx tsx scripts/countries/gen-country-eras.ts ES --force
 *
 * ⚠️ `usdExchangeRate` must be set: the base value (0.0149) is per-peseta,
 * but 2027 seeds ES budgets in EUR. Scale by the authored cross rate:
 * 0.0149 x 67 (ESP/anchor) / 0.92 (EUR/anchor), matching
 * `seedExchangeRates`. Left unset, anchor normalization and the seeded EUR
 * budget disagree ~73x.
 */
export const ES_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    usdExchangeRate: 1.0851086956521736,
  },
};
