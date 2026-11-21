import { requireNationalGdpPerCapita } from "@/lib/campaigns/rules/gdpBaseline";
import {
  campaignAnchorToLocal,
  campaignLocalRate,
  type CampaignCurrencyRates,
} from "@/lib/campaigns/campaignCurrency";

import type { Character, PoliticalParty, StatePartyOrg, NPP } from "@/lib/db/types";

import {
  projectCharacterGeneration,
  projectNppGeneration,
  calculateTaxAmount,
} from "@/lib/utils/fundGeneration";

import { DEFAULT_LEGACY_COUNTRY_ID, type CountryId } from "@/lib/constants/countries";

export /** Pre-fetched data for revenue calculation (avoids N+1 queries) */
interface RevenueContext {
  /** World reset preset selecting the GDP-baseline era (issue #798). */
  preset: string;
  priceLevel?: number;
  /** Frozen base-rate snapshot: anchor campaign money -> local treasury currency. */
  campaignRates: CampaignCurrencyRates;
  partyMap: Map<string, PoliticalParty>;
  statePartyOrgMap: Map<string, StatePartyOrg>;
  statePopMap: Map<string, number>;
  // Raw state GDP (undefined when absent → country-average scalar 1.0, matching
  // the turn processor; coalescing to 0 would wrongly clamp to the 0.9 floor).
  stateGdpMap: Map<string, number | undefined>;
  /** Live national GDP per capita by country, the income-scalar baseline. */
  nationalGdpIndex: ReadonlyMap<string, number>;
  // NPPs only generate/are taxed when the economy is enabled (mirrors
  // processNppFundGeneration); otherwise they contribute $0 to revenue, so GOTV
  // never budgets against NPP income the treasury will not receive.
  nppEconomyEnabled: boolean;
  charactersByParty: Map<string, Character[]>;
  charactersByPartyState: Map<string, Character[]>;
  nppsByParty: Map<string, NPP[]>;
  nppsByPartyState: Map<string, NPP[]>;
}

export /**
 * Calculate the expected hourly revenue for a national or state party.
 * Revenue = sum of tax income from all members' fund generation.
 * Uses pre-fetched data to avoid per-budget DB queries.
 */
function calculatePartyRevenueFromContext(
  partyId: string,
  scope: "national" | "state",
  ctx: RevenueContext,
  countryId?: CountryId,
  stateId?: string
): number {
  if (scope === "national") {
    if (!countryId) return 0;
    const party = ctx.partyMap.get(`${countryId}:${partyId}`);
    const nationalTaxRate = party?.nationalTaxRate ?? 0;
    if (nationalTaxRate <= 0) return 0;

    const partyKey = `${countryId}:${partyId}`;
    const characters = ctx.charactersByParty.get(partyKey) ?? [];
    const npps = ctx.nppsByParty.get(partyKey) ?? [];

    let revenue = 0;
    for (const member of characters) {
      const pop = ctx.statePopMap.get(member.homeState) ?? 0;
      const totalFundRate = projectCharacterGeneration({
        population: pop,
        donorBaseLevel: member.donorBaseLevel,
        currentOffice: member.currentOffice,
        stateGdpMillions: ctx.stateGdpMap.get(member.homeState),
        countryId,
        politicalInfluence: member.politicalInfluence ?? 0,
        preset: ctx.preset,
        priceLevel: ctx.priceLevel,
        nationalGdpPerCapita: requireNationalGdpPerCapita(ctx.nationalGdpIndex, countryId),
      });
      // Treasuries hold LOCAL campaign money: the deposit phases convert anchor
      // generation to local before taxing, so the revenue estimate must too.
      revenue += calculateTaxAmount(
        campaignAnchorToLocal(
          totalFundRate,
          member.countryId ?? "US",
          ctx.campaignRates,
          ctx.preset
        ),
        nationalTaxRate
      );
    }
    for (const npp of npps) {
      const pop = ctx.statePopMap.get(npp.homeState) ?? 0;
      const nppRate = campaignLocalRate(npp.countryId ?? "US", ctx.campaignRates, ctx.preset);
      const totalFundRate = projectNppGeneration({
        population: pop,
        donorBaseLevel: npp.donorBaseLevel ?? 0,
        currentFundsLocal: (npp.funds ?? 0) / (nppRate * (ctx.priceLevel ?? 1)),
        nppEconomyEnabled: ctx.nppEconomyEnabled,
      });
      revenue += calculateTaxAmount(
        campaignAnchorToLocal(
          totalFundRate * (ctx.priceLevel ?? 1),
          npp.countryId ?? "US",
          ctx.campaignRates,
          ctx.preset
        ),
        nationalTaxRate
      );
    }
    return revenue;
  } else {
    if (!stateId) return 0;
    const statePartyKey = `${stateId}_${partyId}`;
    const stateParty = ctx.statePartyOrgMap.get(statePartyKey);
    const stateTaxRate = stateParty?.stateTaxRate ?? 0;
    if (stateTaxRate <= 0) return 0;

    const pop = ctx.statePopMap.get(stateId) ?? 0;
    if (pop === 0) return 0;

    const key = `${countryId ?? DEFAULT_LEGACY_COUNTRY_ID}:${partyId}_${stateId}`;
    const characters = ctx.charactersByPartyState.get(key) ?? [];
    const npps = ctx.nppsByPartyState.get(key) ?? [];

    let revenue = 0;
    for (const member of characters) {
      const totalFundRate = projectCharacterGeneration({
        population: pop,
        donorBaseLevel: member.donorBaseLevel,
        currentOffice: member.currentOffice,
        stateGdpMillions: ctx.stateGdpMap.get(stateId),
        countryId,
        politicalInfluence: member.politicalInfluence ?? 0,
        preset: ctx.preset,
        priceLevel: ctx.priceLevel,
        nationalGdpPerCapita: requireNationalGdpPerCapita(ctx.nationalGdpIndex, countryId ?? "US"),
      });
      revenue += calculateTaxAmount(
        campaignAnchorToLocal(
          totalFundRate,
          member.countryId ?? "US",
          ctx.campaignRates,
          ctx.preset
        ),
        stateTaxRate
      );
    }
    for (const npp of npps) {
      const nppRate = campaignLocalRate(npp.countryId ?? "US", ctx.campaignRates, ctx.preset);
      const totalFundRate = projectNppGeneration({
        population: pop,
        donorBaseLevel: npp.donorBaseLevel ?? 0,
        currentFundsLocal: (npp.funds ?? 0) / (nppRate * (ctx.priceLevel ?? 1)),
        nppEconomyEnabled: ctx.nppEconomyEnabled,
      });
      revenue += calculateTaxAmount(
        campaignAnchorToLocal(
          totalFundRate * (ctx.priceLevel ?? 1),
          npp.countryId ?? "US",
          ctx.campaignRates,
          ctx.preset
        ),
        stateTaxRate
      );
    }
    return revenue;
  }
}
