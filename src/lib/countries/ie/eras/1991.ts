import type { CountryEraOverride } from "../../contract";

/**
 * IE, 1991. Differences only; everything else comes from the base modules.
 *
 * Generated from `__snapshots__/ie.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts IE --force
 *
 * No per-era orders of battle: falls back to the base set.
 *
 * `usdExchangeRate` is the anchor value of one unit of the stored seed
 * currency against a modern base of 1.0. The reconciled 1991 regional GDP is in
 * Irish pounds, so this is the reciprocal of the sourced annual quote,
 * 0.6212975 IEP/USD. `gdpAnchorRate1991.test.ts` pins it to the seeded quote.
 */
export const IE_1991: CountryEraOverride = {
  preset: "1991-default",
  config: {
    usdExchangeRate: 1 / 0.6212975,
  },
};
