import {
  getCampaignCurrency,
  campaignLocalRate,
  type CampaignCurrencyRates,
} from "@/lib/campaigns/rules/currency";
import { eraRateForCurrency } from "./currencyRates";
import {
  COUNTRY_CURRENCY_MAP,
  INITIAL_RATES,
  getCountryIdForCurrency,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";

/** Personal grants use the world's home currency and the selected monetary quote. */
export function buildHomeCurrencyCashGrantSetStage(
  cashOnHand: number,
  rateByCountry: Map<string, number>,
  preset?: string
): Record<string, unknown> {
  const countriesByCurrency = new Map<CurrencyCode, CountryId[]>();
  for (const [countryId, code] of Object.entries(COUNTRY_CURRENCY_MAP) as Array<
    [CountryId, CurrencyCode]
  >) {
    const currency = preset === undefined ? code : getCampaignCurrency(countryId, preset);
    const list = countriesByCurrency.get(currency) ?? [];
    list.push(countryId);
    countriesByCurrency.set(currency, list);
  }

  const setStage: Record<string, unknown> = {};
  for (const [currencyCode, countryIds] of countriesByCurrency) {
    const path = `currencyBalances.personal.${currencyCode}`;
    const anchorCountry = getCountryIdForCurrency(currencyCode);
    const rate =
      rateByCountry.get(anchorCountry) ??
      eraRateForCurrency(currencyCode, preset) ??
      INITIAL_RATES[anchorCountry] ??
      1;
    const convertedAmount = cashOnHand * rate;
    let expr: Record<string, unknown> = { $ifNull: [`$${path}`, 0] };
    for (const countryId of [...countryIds].reverse()) {
      expr = {
        $cond: {
          if: { $eq: ["$countryId", countryId] },
          then: { $add: [{ $ifNull: [`$${path}`, 0] }, convertedAmount] },
          else: expr,
        },
      };
    }
    setStage[path] = expr;
  }
  return setStage;
}

/** Campaign grants use the same fixed currency basis as political costs. */
export function buildCampaignFundsGrantExpression(
  funds: number,
  rates: CampaignCurrencyRates,
  preset?: string
): Record<string, unknown> {
  const pairs = Object.keys(COUNTRY_CURRENCY_MAP) as CountryId[];
  let expr: Record<string, unknown> = { $ifNull: ["$currencyBalances.campaign", 0] };
  for (const countryId of [...pairs].reverse()) {
    const rate = campaignLocalRate(countryId, rates, preset);
    expr = {
      $cond: {
        if: { $eq: ["$countryId", countryId] },
        then: { $add: [{ $ifNull: ["$currencyBalances.campaign", 0] }, funds * rate] },
        else: expr,
      },
    };
  }
  return expr;
}
