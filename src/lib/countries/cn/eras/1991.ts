import type { CountryEraOverride } from "../../contract";

/**
 * CN, 1991.
 *
 * ⚠ GENERATED from `__snapshots__/cn.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts CN --force
 *
 * ⚠ DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * No per-era orders of battle: this era falls back to the base set.
 *
 * ⚠️ `usdExchangeRate` must be set here: the field anchors ONE unit of this
 * country's stored seed currency, and the base value 0.138 belongs to no
 * modelled era. `cnRegions1991` authors regional GDP in CNY millions, so the
 * anchor must be the reciprocal of `INITIAL_RATES_1991` (5.32 CNY/USD), the
 * same table `seedExchangeRates` writes to `exchangeRates`. Left unset,
 * China reads as a $298B economy against a real ~$383B.
 */
export const CN_1991: CountryEraOverride = {
  preset: "1991-default",
  config: {
    usdExchangeRate: 0.18796992481203006,
  },
};
