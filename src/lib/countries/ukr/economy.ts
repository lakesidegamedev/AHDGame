import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/**
 * GENERATED FILE: from __snapshots__/ukr.pre-move.json. Regenerate with scripts/countries/gen-country-economy.ts UKR.
 * Exchange rate lives with the era rate table, not here: a rate is a (pair, year) fact.
 * All figures are in local currency; do not reconcile toward other countries.
 * No monetary baseline for 1971/1979/1991: key absent, not defaulted, so fallback stays a fallback.
 */

const currencyCode = "SUR" as CurrencyCode;
const nationalPolicyStateId = "ukr_national";
const legislationScope = "ukr";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 3,
};
const sectorWeightsBase = {
  manufacturing: 22,
  agriculture: 16,
  extraction: 10,
  energy: 9,
  chemical_industries: 8,
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
const UKR_GDP_DENOMINATION_1953 = "local";

export const UKR_ECONOMY: CountryEconomy = {
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
        agriculture: 26,
        manufacturing: 18,
        extraction: 14,
        energy: 7,
        construction: 8,
        defense: 7,
        chemical_industries: 4,
        logistics: 5,
        healthcare: 3,
        retail: 2,
        media: 1,
        manufacturing_vehicles: 1,
        financial: 1,
        real_estate: 1,
        telecommunications: 1,
        media_entertainment: 1,
        technology: 0,
      },
      "1979": {
        manufacturing: 27,
        agriculture: 14,
        extraction: 10,
        energy: 9,
        chemical_industries: 8,
        defense: 9,
        construction: 7,
        logistics: 5,
        healthcare: 4,
        retail: 3,
        technology: 1,
        manufacturing_vehicles: 1,
        telecommunications: 1,
        media: 1,
        media_entertainment: 1,
        financial: 0,
        real_estate: 0,
      },
      "1991": {
        manufacturing: 22,
        agriculture: 16,
        extraction: 10,
        energy: 9,
        chemical_industries: 8,
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
  gdpDenomination1953: UKR_GDP_DENOMINATION_1953,
};
