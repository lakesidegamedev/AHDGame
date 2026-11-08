/**
 * Anchor to a campaign treasury's currency, in one place.
 *
 * Campaign income and campaign costs (Presence builds, state attacks and every
 * screen that quotes them) convert at the same frozen world basis, so a price
 * never moves against income because live forex moved. This was previously
 * copied into the build route, the attack route and the quoting screens, and
 * the copies disagreed about whether to convert at all.
 */

import type { Db } from "mongodb";
import { campaignLocalRate, loadCampaignCurrencyRates } from "@/lib/campaigns/campaignCurrency";

/**
 * Local units per anchor for this character's campaign currency, from the
 * world's frozen base rates. Falls back to the seeded rate when no base rate
 * row exists, matching campaign income.
 */
export async function loadCampaignFxRate(
  db: Db,
  character: { countryId?: string },
  preset?: string
): Promise<number> {
  const rates = await loadCampaignCurrencyRates(db);
  return campaignLocalRate(character.countryId ?? "US", rates, preset);
}
