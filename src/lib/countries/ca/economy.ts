import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/**
 * Canada's economy.
 *
 * Exchange rates live with the rates they must stay consistent with, not here.
 * Every figure is in Canadian dollars; do not reconcile across countries.
 *
 * Sources: IMF World Economic Outlook (nominal GDP, growth, inflation),
 * Statistics Canada National Accounts (sector mix), Bank of Canada (2% inflation
 * target, neutral policy rate range of 2.25 to 3.25 percent).
 */

const currencyCode = "CAD" as CurrencyCode;
const nationalPolicyStateId = "ca_national";
const legislationScope = "ca";
const economicBaseline = {
  gdpGrowth: 1.6,
  tradeGrowth: 2.2,
};
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 2.75,
};
const sectorWeightsBase = {
  financial: 13,
  energy: 12,
  real_estate: 11,
  extraction: 9,
  manufacturing: 8,
  healthcare: 8,
  retail: 7,
  construction: 7,
  technology: 6,
  agriculture: 4,
  logistics: 4,
  telecommunications: 3,
  manufacturing_vehicles: 3,
  chemical_industries: 2,
  media: 1,
  media_entertainment: 1,
  defense: 1,
};
const repEcon = {
  gdp: 3_450_000_000_000,
  population: 41_789_000,
};
const costScaleAnchors = {
  gdpLow: 700_000_000_000,
  popLow: 25_000_000,
  scaleLow: 0.3,
  gdpHigh: 3_450_000_000_000,
  popHigh: 41_789_000,
  scaleHigh: 1.1,
};
const strategicSectors = ["energy", "extraction"] as OperatingSectorType[];
const treasuryPsRate = {
  national: 85000,
  state: 42500,
};

export const CA_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  economicBaseline,
  monetary: {
    baseline: baselineMonetary,
    byEra: {},
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {},
  },
  strategicSectors,
  repEcon,
  costScaleAnchors,
  tax: {
    neutralFederalSalesTax: 5,
    neutralStateSalesTax: 0,
    treasuryPsRate,
  },
  payoutCapPerTurn: 2_000_000,
  sovereignCorpLegalStructure: "ca_corp" as LegalStructureId,
};
