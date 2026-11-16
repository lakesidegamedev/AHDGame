import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * Texas's economy as a successor country. It keeps the US dollar, so
 * monetary anchors follow the United States'.
 *
 * Every figure is in US dollars. Sector weights are rounded shares of Texas
 * GDP by industry (Bureau of Economic Analysis, GDP by state), mapped onto
 * game sectors; oil and gas count as energy and extraction.
 *
 * The live economy is not seeded from here: independence apportions the
 * state's running aggregates across the successor regions.
 */

const currencyCode = "USD" as CurrencyCode;
const nationalPolicyStateId = "rtx_national";
const legislationScope = "rtx";
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 3,
};
const sectorWeightsBase = {
  energy: 14,
  extraction: 8,
  real_estate: 11,
  financial: 9,
  manufacturing: 8,
  healthcare: 7,
  retail: 7,
  technology: 7,
  construction: 6,
  logistics: 5,
  chemical_industries: 5,
  agriculture: 3,
  telecommunications: 3,
  defense: 3,
  media: 2,
};
const strategicSectors = ["energy", "extraction"] as OperatingSectorType[];
const treasuryPsRate = {
  national: 60000,
  state: 30000,
};

export const RTX_ECONOMY: CountryEconomy = {
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
