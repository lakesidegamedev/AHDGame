import type { CountryEraOverride } from "../../contract";

/**
 * TR, 2027.
 *
 * ⚠ DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * The 2027 world prices Turkey in the modern lira (TRY), which replaced the
 * old lira at 1,000,000 to 1 on 1 January 2005. The national budget and
 * bonds seed in TRY (see `getSeedCurrencyCode`), so the country page names
 * the same currency. `usdExchangeRate` stays on the base config: it prices
 * the regional GDP anchors, which keep their existing game units.
 *
 * No per-era orders of battle: this era falls back to the base set rather
 * than inventing an empty one.
 */
export const TR_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    currencyCode: "TRY",
  },
};
