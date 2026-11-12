import type { CountryEraOverride } from "../../contract";

/**
 * UK, 1991.
 *
 * ⚠ GENERATED from `__snapshots__/uk.pre-move.json`. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-eras.ts UK --force
 *
 * ⚠ DIFFERENCES ONLY. Unlisted fields come from base modules.
 *
 * `usdExchangeRate` is the anchor value of one unit of stored seed
 * currency. `ukRegions1991` authors GDP in GBP millions, so this must be
 * the reciprocal of `INITIAL_RATES_1991` (0.57 GBP/USD) to match the
 * `exchangeRates` table. Left at 1.0, UK GDP reads roughly a quarter of
 * reality.
 */
export const UK_1991: CountryEraOverride = {
  preset: "1991-default",
  config: {
    usdExchangeRate: 1.7543859649122808,
    legislature: {
      name: "Parliament",
      path: "/country/uk/legislature",
      bicameral: false,
      upperChamber: {
        key: "lords",
        name: "House of Lords",
        shortName: "Lords",
        seats: 784,
        description: "Appointed and hereditary peers. Revises and scrutinises legislation.",
      },
      lowerChamber: {
        key: "commons",
        name: "House of Commons",
        shortName: "Commons",
        // 650, not 651: this world opens in January 1991, and the 651-seat
        // chamber is the one the 1992 boundary review created. See the header
        // of `ukRegions1991.ts`, whose districts this total must equal.
        seats: 650,
        description:
          "650 elected MPs from single-member constituencies. The primary legislative chamber.",
      },
    },
  },
};
