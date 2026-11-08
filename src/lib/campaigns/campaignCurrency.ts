/**
 * Campaign currency shell loads a world's fixed base rates once for the caller.
 * Political income and costs share this snapshot; live forex remains reserved
 * for market transactions. Missing legacy rate rows retain the historical fallback.
 */

import { resolveCampaignPriceLevel } from "./rules/priceLevel";
import { nationalGdpPerCapitaIndex, requireNationalGdpPerCapita } from "./rules/gdpBaseline";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { Db } from "mongodb";
import type { ExchangeRate } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

export { campaignAnchorToLocal, campaignLocalRate, getCampaignCurrency } from "./rules/currency";
import { getCampaignCurrency, type CampaignCurrencyRates } from "./rules/currency";
export type { CampaignCurrencyRates } from "./rules/currency";

export async function loadCampaignCurrencyRates(db: Db): Promise<CampaignCurrencyRates> {
  const rows = await db
    .collection<ExchangeRate>("exchangeRates")
    .find({}, { projection: { currencyCode: 1, baseRate: 1 } })
    .toArray();
  const rates: CampaignCurrencyRates = {};
  for (const row of rows) {
    if (typeof row.baseRate === "number" && Number.isFinite(row.baseRate) && row.baseRate > 0)
      rates[row.currencyCode] = row.baseRate;
  }
  return rates;
}

/** Convert an anchor amount to local currency, rounded to a whole unit. */
export function anchorToLocal(anchor: number, rate: number): number {
  return Math.round(anchor * rate);
}

/**
 * Resolve a campaign country's local currency + FX rate. Falls back to rate 1.0
 * (anchor == local) when forex is disabled or no rate doc exists, so callers
 * never divide by an undefined rate.
 */
export async function loadCampaignFxRate(
  db: Db,
  countryId: string,
  preset?: string
): Promise<{ rate: number; currencyCode: CurrencyCode }> {
  const currencyCode = getCampaignCurrency(countryId, preset);
  const rateDoc = await db
    .collection<ExchangeRate>("exchangeRates")
    .findOne({ currencyCode }, { projection: { rate: 1 } });
  if (!rateDoc || !Number.isFinite(rateDoc.rate) || rateDoc.rate <= 0) {
    return { rate: 1.0, currencyCode };
  }
  return { rate: rateDoc.rate, currencyCode };
}

/** Load the world's campaign price basis once at the shell boundary. */
export async function loadCampaignPriceLevel(db: Db): Promise<number> {
  const [config, state] = await Promise.all([
    db
      .collection<{ _id: string; campaignEraPriceLevelEnabled?: boolean }>("gameConfig")
      .findOne({ _id: "default" }, { projection: { campaignEraPriceLevelEnabled: 1 } }),
    db
      .collection<{ _id: string; preset?: string }>("gameState")
      .findOne({ _id: "current" }, { projection: { preset: 1 } }),
  ]);
  return resolveCampaignPriceLevel(config?.campaignEraPriceLevelEnabled, state?.preset);
}

/**
 * Load live national GDP per capita for every country in one grouped read.
 * Campaign income and cost scalars measure a region against this figure, so
 * they follow the economy instead of a start-of-world number. Countries with
 * no usable regional GDP are absent from the map.
 */
export async function loadNationalGdpPerCapitaIndex(db: Db): Promise<Map<string, number>> {
  const rows = await (
    await getStatesCollection(db)
  )
    .aggregate<{ _id: string | null; gdp: number; population: number }>([
      {
        $group: {
          _id: "$countryId",
          gdp: { $sum: { $ifNull: ["$gdp", 0] } },
          population: { $sum: "$population" },
        },
      },
    ])
    .toArray();
  return nationalGdpPerCapitaIndex(
    rows.map((r) => ({ countryId: r._id ?? "US", gdp: r.gdp, population: r.population }))
  );
}

/** One country's live national GDP per capita; throws when it has no regional GDP. */
export async function loadNationalGdpPerCapita(db: Db, countryId: string): Promise<number> {
  return requireNationalGdpPerCapita(await loadNationalGdpPerCapitaIndex(db), countryId);
}
