import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/**
 * GENERATED FILE: from __snapshots__/ro.pre-move.json. Regenerate with scripts/countries/gen-country-economy.ts RO.
 * Exchange rate lives with the era rate table, not here: a rate is a (pair, year) fact.
 * All figures are in local currency; do not reconcile toward other countries.
 * No monetary baseline for 1971/1979/1991: key absent, not defaulted, so fallback stays a fallback.
 */

const currencyCode = "ROL" as CurrencyCode;
const nationalPolicyStateId = "ro_national";
const legislationScope = "ro";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 3,
  neutralPrimeRate: 5,
};
const sectorWeightsBase = {
  manufacturing: 20,
  agriculture: 16,
  energy: 10,
  extraction: 8,
  chemical_industries: 8,
  construction: 7,
  retail: 6,
  healthcare: 4,
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
const RO_GDP_DENOMINATION_1953 = "local";

export const RO_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 2,
        neutralPrimeRate: 3.5,
        trendGdpGrowth: 3.5,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1953": {
        agriculture: 30,
        extraction: 12,
        manufacturing: 18,
        defense: 10,
        energy: 6,
        construction: 6,
        chemical_industries: 4,
        logistics: 4,
        healthcare: 3,
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
        manufacturing: 24,
        agriculture: 18,
        extraction: 10,
        chemical_industries: 10,
        energy: 7,
        defense: 9,
        construction: 7,
        logistics: 4,
        healthcare: 4,
        retail: 2,
        manufacturing_vehicles: 2,
        telecommunications: 1,
        media: 1,
        media_entertainment: 1,
        financial: 0,
        real_estate: 0,
        technology: 0,
      },
      "1991": {
        manufacturing: 20,
        agriculture: 16,
        energy: 10,
        extraction: 8,
        chemical_industries: 8,
        construction: 7,
        retail: 6,
        healthcare: 4,
      },
    },
  },
  strategicSectors,
  tax: {
    treasuryPsRate,
  },
  sovereignCorpLegalStructure: "generic_corp" as LegalStructureId,
  gdpDenomination1953: RO_GDP_DENOMINATION_1953,
};
