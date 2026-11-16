import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * Alberta's economy as a successor country. It keeps the Canadian dollar, so
 * monetary anchors follow Canada's.
 *
 * Every figure is in Canadian dollars. Sector weights are rounded shares of
 * Alberta GDP by industry (Statistics Canada, GDP at basic prices by industry),
 * mapped onto game sectors; oil and gas count as energy and extraction.
 *
 * The live economy is not seeded from here: independence apportions the
 * province's running aggregates across the successor regions.
 */

const currencyCode = "CAD" as CurrencyCode;
const nationalPolicyStateId = "ab_national";
const legislationScope = "ab";
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 2.75,
};
const sectorWeightsBase = {
  energy: 20,
  extraction: 10,
  real_estate: 9,
  financial: 8,
  construction: 8,
  healthcare: 7,
  manufacturing: 6,
  retail: 6,
  agriculture: 5,
  logistics: 5,
  technology: 4,
  chemical_industries: 4,
  telecommunications: 3,
  media: 3,
  defense: 1,
};
const strategicSectors = ["energy", "extraction"] as OperatingSectorType[];
const treasuryPsRate = {
  national: 34500,
  state: 17250,
};

export const AB_ECONOMY: CountryEconomy = {
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
