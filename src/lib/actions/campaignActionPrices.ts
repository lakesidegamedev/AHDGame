import type { Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import { quotePollAction } from "@/lib/actions/rules";
import {
  campaignLocalRate,
  loadCampaignCurrencyRates,
  loadCampaignPriceLevel,
} from "@/lib/campaigns/campaignCurrency";
import { canvassUnitFundsCost } from "@/lib/canvassing/cost";
import { isForexEnabled } from "@/lib/currency/featureFlag";

export type CampaignActionPrices = Record<"poll" | "pollLarge" | "canvass", number | null>;

/** Display prices in the same currency and units the action handlers debit. */
export async function loadCampaignActionPrices(
  db: Db,
  character: Pick<Character, "countryId" | "stats">
): Promise<CampaignActionPrices> {
  const [priceLevel, rates, forex] = await Promise.all([
    loadCampaignPriceLevel(db),
    loadCampaignCurrencyRates(db),
    isForexEnabled(),
  ]);
  const rate = forex ? campaignLocalRate(character.countryId ?? "US", rates) : 1;
  const stats = { intellect: character.stats?.intellect };
  const quick = quotePollAction(stats, "small", priceLevel);
  const full = quotePollAction(stats, "large", priceLevel);
  return {
    poll: quick.ok ? quick.fundCostAnchor * rate : null,
    pollLarge: full.ok ? full.fundCostAnchor * rate : null,
    canvass: canvassUnitFundsCost(priceLevel) * rate,
  };
}
