/**
 * Campaign currency shell loads a world's fixed base rates once for the caller.
 * Political income and costs share this snapshot; live forex remains reserved
 * for market transactions. Missing legacy rate rows retain the historical fallback.
 */

import { resolveCampaignPriceLevel } from "./rules/priceLevel";
import type { Db } from "mongodb";
import type { ExchangeRate } from "@/lib/db/types";

export { campaignAnchorToLocal, campaignLocalRate, getCampaignCurrency } from "./rules/currency";
import type { CampaignCurrencyRates } from "./rules/currency";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
export type { CampaignCurrencyRates } from "./rules/currency";

export async function loadCampaignCurrencyRates(db: Db): Promise<CampaignCurrencyRates> {
  const rows = await exchangeRatesCollection(db)
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

/** Load the world's campaign price basis once at the shell boundary. */
export async function loadCampaignPriceLevel(db: Db): Promise<number> {
  const [config, state] = await Promise.all([
    db
      .collection<{ _id: string; campaignEraPriceLevelEnabled?: boolean }>("gameConfig")
      .findOne({ _id: "default" }, { projection: { campaignEraPriceLevelEnabled: 1 } }),
    gameStateCollection<{ _id: string; preset?: string }>(db).findOne(
      { _id: "current" },
      { projection: { preset: 1 } }
    ),
  ]);
  return resolveCampaignPriceLevel(config?.campaignEraPriceLevelEnabled, state?.preset);
}
