import type { CountryEraOverride } from "../../contract";
import { INITIAL_RATES_1991 } from "@/lib/constants/currencies";

/**
 * FR, 1991.
 *
 * ⚠ GENERATED from `__snapshots__/fr.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts FR --force
 *
 * ⚠ DIFFERENCES ONLY. Everything not named here comes from the base modules.
 *
 * usdExchangeRate is the reciprocal of INITIAL_RATES_1991.FR, because the 1991
 * GDP seeds are authored in legacy currency at the 1991 average.
 *
 * No orders of battle: falls back to the base set.
 */
export const FR_1991: CountryEraOverride = {
  preset: "1991-default",
  config: { usdExchangeRate: 1 / INITIAL_RATES_1991.FR! },
};
