import type { CountryEraOverride } from "../../contract";

/**
 * DE, 1991.
 *
 * ⚠ GENERATED from `__snapshots__/de.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts DE --force
 *
 * ⚠ DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * No per-era orders of battle: this era falls back to the base set.
 *
 * ⚠️ `usdExchangeRate` must be set here: the field anchors ONE unit of this
 * country's stored seed currency, and the base value is a modern 1.0.
 * `deRegions1991` authors regional GDP in DM millions treated as EUR-equivalent,
 * so the anchor must be the reciprocal of `INITIAL_RATES_1991` (0.85 DEM-as-EUR/USD),
 * the same table `seedExchangeRates` writes to `exchangeRates`. Left unset,
 * Germany reads as a $1.46T economy against a real ~$1.81T.
 */
export const DE_1991: CountryEraOverride = {
  preset: "1991-default",
  config: {
    usdExchangeRate: 1.1764705882352942,
  },
};
