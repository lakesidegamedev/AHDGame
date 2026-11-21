import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * California's economy as a successor country. It keeps the US dollar, so
 * monetary anchors follow the United States'.
 *
 * Every figure is in US dollars. Sector weights are rounded shares of California
 * GDP by industry (Bureau of Economic Analysis, GDP by state), mapped onto
 * game sectors; software and internet count as technology.
 *
 * The live economy is not seeded from here: independence apportions the
 * state's running aggregates across the successor regions.
 */

const currencyCode = "USD" as CurrencyCode;
const nationalPolicyStateId = "rca_national";
const legislationScope = "rca";
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 3,
};
const sectorWeightsBase = {
  technology: 16,
  real_estate: 12,
  financial: 9,
  healthcare: 8,
  media: 6,
  manufacturing: 6,
  retail: 6,
  construction: 5,
  logistics: 5,
  agriculture: 4,
  energy: 4,
  telecommunications: 4,
  chemical_industries: 3,
  defense: 3,
  extraction: 1,
};
const strategicSectors = ["technology", "media"] as OperatingSectorType[];
const treasuryPsRate = {
  national: 60000,
  state: 30000,
};

export const RCA_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {},
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {},
  },
  strategicSectors,
  tax: {
    treasuryPsRate,
  },
};
