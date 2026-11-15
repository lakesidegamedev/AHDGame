import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/*
 * BAL's money. Generated from `__snapshots__/bal.pre-move.json`.
 * Regenerate: npx tsx scripts/countries/gen-country-economy.ts BAL --force
 * Exchange rate is not here: it is a fact about a pair of countries in a year.
 * All figures are in local currency, not comparable across countries.
 * No monetary baseline for 1971, 1979, 1991: key is absent, not defaulted.
 */

const currencyCode = "SUR" as CurrencyCode;
const nationalPolicyStateId = "bal_national";
const legislationScope = "bal";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 3,
};
const sectorWeightsBase = {
  manufacturing: 18,
  agriculture: 16,
  logistics: 8,
  energy: 7,
  construction: 7,
  retail: 6,
  healthcare: 5,
};
// No REP_ECON row; the folder omits `repEcon` rather than defaulting it.
// No COST_SCALE_ANCHORS row; the folder omits `costScaleAnchors` rather than defaulting it.
/**
 * ⚠ THE CAST IS LOAD-BEARING, for the same reason as the cabinet groups:
 * JSON.parse widens each sector name to `string`, and `OperatingSectorType[]` is a
 * union array. Caught by typecheck alone.
 */
const strategicSectors: OperatingSectorType[] = [];
const treasuryPsRate = {
  national: 50000,
  state: 25000,
};

/**
 * Whether this country's authored 1953 GDP figures are denominated in USD or in
 * local currency.
 *
 * ⚠ 1953 ONLY. `GDP_DENOMINATION_1953` is an era table and holds no other
 * preset, so this says nothing about any later era.
 */
const BAL_GDP_DENOMINATION_1953 = "local";

export const BAL_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 0.5,
        neutralPrimeRate: 2.5,
        trendGdpGrowth: 4.5,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1953": {
        manufacturing: 22,
        extraction: 8,
        defense: 10,
        agriculture: 15,
        energy: 6,
        logistics: 6,
        chemical_industries: 5,
        construction: 6,
        healthcare: 5,
        retail: 3,
        media: 2,
        real_estate: 2,
        telecommunications: 2,
        financial: 1,
        manufacturing_vehicles: 1,
        media_entertainment: 3,
        technology: 2,
      },
      "1979": {
        manufacturing: 26,
        agriculture: 13,
        energy: 9,
        chemical_industries: 8,
        defense: 8,
        construction: 7,
        logistics: 6,
        healthcare: 5,
        retail: 4,
        extraction: 4,
        technology: 3,
        telecommunications: 2,
        media_entertainment: 2,
        media: 1,
        manufacturing_vehicles: 2,
        financial: 0,
        real_estate: 0,
      },
      "1991": {
        manufacturing: 18,
        agriculture: 16,
        logistics: 8,
        energy: 7,
        construction: 7,
        retail: 6,
        healthcare: 5,
      },
    },
  },
  strategicSectors,
  tax: {
    treasuryPsRate,
  },
  sovereignCorpLegalStructure: "generic_corp" as LegalStructureId,
  gdpDenomination1953: BAL_GDP_DENOMINATION_1953,
};
