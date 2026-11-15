import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/*
 * CS's money. Generated from `__snapshots__/cs.pre-move.json`.
 * Regenerate: npx tsx scripts/countries/gen-country-economy.ts CS --force
 * Exchange rate is not here: it is a fact about a pair of countries in a year.
 * All figures are in local currency, not comparable across countries.
 * No monetary baseline for 1971, 1979, 1991: key is absent, not defaulted.
 */

const currencyCode = "CSK" as CurrencyCode;
const nationalPolicyStateId = "cs_national";
const legislationScope = "cs";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 4,
};
const sectorWeightsBase = {
  manufacturing: 38,
  chemical_industries: 9,
  energy: 8,
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
const CS_GDP_DENOMINATION_1953 = "local";

export const CS_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 1.5,
        neutralPrimeRate: 3.5,
        trendGdpGrowth: 4.5,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1953": {
        manufacturing: 33,
        defense: 14,
        chemical_industries: 8,
        extraction: 8,
        energy: 6,
        agriculture: 12,
        construction: 8,
        logistics: 5,
        healthcare: 4,
        retail: 1,
        media: 2,
        financial: 1,
        real_estate: 1,
        telecommunications: 1,
        technology: 1,
      },
      "1979": {
        manufacturing: 33,
        chemical_industries: 10,
        defense: 10,
        energy: 7,
        extraction: 7,
        agriculture: 9,
        construction: 7,
        logistics: 5,
        healthcare: 4,
        retail: 3,
        telecommunications: 1,
        media: 3,
        financial: 1,
        real_estate: 0,
        technology: 0,
      },
      "1991": {
        manufacturing: 38,
        chemical_industries: 9,
        energy: 8,
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
  gdpDenomination1953: CS_GDP_DENOMINATION_1953,
};
