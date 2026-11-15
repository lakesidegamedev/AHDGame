import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/**
 * GENERATED FROM __snapshots__/hu.pre-move.json. Regenerate with:
 * npx tsx scripts/countries/gen-country-economy.ts HU --force
 * Exchange rate lives with the rates it must stay consistent with, not here.
 * Every figure is in local currency; do not reconcile across countries.
 */

const currencyCode = "HUF" as CurrencyCode;
const nationalPolicyStateId = "hu_national";
const legislationScope = "hu";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 3,
  neutralPrimeRate: 5,
};
const sectorWeightsBase = {
  manufacturing: 29,
  agriculture: 14,
  chemical_industries: 10,
  energy: 9,
  construction: 8,
  retail: 6,
  logistics: 5,
  healthcare: 5,
  real_estate: 3,
  extraction: 3,
  defense: 2,
  financial: 2,
  technology: 1,
  telecommunications: 1,
  media: 2,
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
const HU_GDP_DENOMINATION_1953 = "local";

export const HU_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 3,
        neutralPrimeRate: 3.5,
        trendGdpGrowth: 3.5,
      },
      "1971": {
        targetInflation: 2.5,
        neutralPrimeRate: 3.5,
        trendGdpGrowth: 3,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1953": {
        manufacturing: 23,
        defense: 12,
        agriculture: 20,
        extraction: 8,
        construction: 8,
        chemical_industries: 5,
        energy: 5,
        logistics: 4,
        healthcare: 4,
        retail: 2,
        media: 3,
        financial: 1,
        real_estate: 1,
        telecommunications: 1,
        technology: 0,
      },
      "1979": {
        manufacturing: 27,
        agriculture: 14,
        chemical_industries: 10,
        defense: 8,
        extraction: 6,
        energy: 6,
        construction: 7,
        logistics: 5,
        healthcare: 5,
        retail: 5,
        telecommunications: 2,
        media: 4,
        financial: 1,
        real_estate: 0,
        technology: 0,
      },
      "1991": {
        manufacturing: 30,
        agriculture: 16,
        chemical_industries: 10,
        energy: 9,
        construction: 8,
        retail: 6,
        logistics: 5,
        healthcare: 4,
        extraction: 3,
        real_estate: 3,
        defense: 2,
        financial: 1,
        technology: 1,
        telecommunications: 1,
        media: 2,
      },
    },
  },
  strategicSectors,
  tax: {
    treasuryPsRate,
  },
  sovereignCorpLegalStructure: "generic_corp" as LegalStructureId,
  gdpDenomination1953: HU_GDP_DENOMINATION_1953,
};
