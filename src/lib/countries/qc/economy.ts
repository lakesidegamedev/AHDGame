import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * Quebec's economy as a successor country. It keeps the Canadian dollar, so
 * monetary anchors follow Canada's.
 *
 * Every figure is in Canadian dollars. Sector weights are rounded shares of
 * Quebec GDP by industry (Institut de la statistique du Quebec, GDP at basic
 * prices by industry), mapped onto game sectors; hydro power counts as energy.
 *
 * The live economy is not seeded from here: independence apportions the
 * province's running aggregates across the successor regions.
 */

const currencyCode = "CAD" as CurrencyCode;
const nationalPolicyStateId = "qc_national";
const legislationScope = "qc";
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 2.75,
};
const sectorWeightsBase = {
  manufacturing: 13,
  real_estate: 12,
  healthcare: 10,
  financial: 8,
  construction: 7,
  retail: 7,
  technology: 7,
  energy: 6,
  logistics: 5,
  media: 3,
  telecommunications: 3,
  extraction: 3,
  manufacturing_vehicles: 3,
  chemical_industries: 3,
  agriculture: 2,
  media_entertainment: 2,
  defense: 1,
};
const strategicSectors = ["energy"] as OperatingSectorType[];
const treasuryPsRate = {
  national: 42500,
  state: 21250,
};

export const QC_ECONOMY: CountryEconomy = {
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
