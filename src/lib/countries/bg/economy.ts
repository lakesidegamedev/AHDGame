import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/*
 * BG's money. Generated from `__snapshots__/bg.pre-move.json`.
 * Regenerate: npx tsx scripts/countries/gen-country-economy.ts BG --force
 * Exchange rate is not here: it is a fact about a pair of countries in a year.
 * All figures are in local currency, not comparable across countries.
 * No monetary baseline for 1971, 1979, 1991: key is absent, not defaulted.
 */

const currencyCode = "BGL" as CurrencyCode;
const nationalPolicyStateId = "bg_national";
const legislationScope = "bg";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 4,
};
const sectorWeightsBase = {
  agriculture: 20,
  manufacturing: 18,
  energy: 8,
  chemical_industries: 7,
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
const BG_GDP_DENOMINATION_1953 = "local";

export const BG_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 1.5,
        neutralPrimeRate: 3.5,
        trendGdpGrowth: 4,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1953": {
        agriculture: 40,
        manufacturing: 15,
        defense: 10,
        construction: 7,
        extraction: 5,
        energy: 5,
        logistics: 4,
        healthcare: 3,
        chemical_industries: 3,
        retail: 2,
        media: 1,
        financial: 1,
        real_estate: 1,
        telecommunications: 1,
        manufacturing_vehicles: 1,
        media_entertainment: 1,
        technology: 0,
      },
      "1979": {
        manufacturing: 22,
        agriculture: 18,
        chemical_industries: 9,
        energy: 8,
        extraction: 6,
        defense: 8,
        construction: 7,
        logistics: 5,
        healthcare: 4,
        retail: 3,
        technology: 3,
        telecommunications: 2,
        manufacturing_vehicles: 1,
        media: 1,
        media_entertainment: 2,
        financial: 1,
        real_estate: 0,
      },
      "1991": {
        agriculture: 20,
        manufacturing: 18,
        energy: 8,
        chemical_industries: 7,
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
  gdpDenomination1953: BG_GDP_DENOMINATION_1953,
};
