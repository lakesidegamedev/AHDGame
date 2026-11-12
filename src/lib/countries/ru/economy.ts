import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/**
 * RU's money.
 *
 * GENERATED from `__snapshots__/ru.pre-move.json`; do not edit by hand.
 * Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-economy.ts RU --force
 *
 * The exchange rate is not here: a rate is a fact about a pair of
 * countries in a year and lives beside the rates table.
 *
 * All figures are in local currency and are not comparable to other
 * countries.
 */

const currencyCode = "SUR" as CurrencyCode;
const nationalPolicyStateId = "su_national";
const legislationScope = "ru";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 3,
};
const sectorWeightsBase = {
  manufacturing: 20,
  energy: 12,
  extraction: 10,
  defense: 10,
  agriculture: 12,
  chemical_industries: 8,
  construction: 7,
  manufacturing_vehicles: 5,
  logistics: 4,
  healthcare: 4,
  retail: 3,
  technology: 2,
  real_estate: 1,
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
  national: 500000,
  state: 250000,
};

/**
 * Whether this country's authored 1953 GDP figures are denominated in USD or in
 * local currency.
 *
 * ⚠ 1953 ONLY. `GDP_DENOMINATION_1953` is an era table and holds no other
 * preset, so this says nothing about any later era.
 */
const RU_GDP_DENOMINATION_1953 = "local";

export const RU_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 1,
        neutralPrimeRate: 2.5,
        trendGdpGrowth: 6,
      },
      "1971": {
        targetInflation: 1.5,
        neutralPrimeRate: 2.5,
        trendGdpGrowth: 3,
      },
      "1979": {
        targetInflation: 1.5,
        neutralPrimeRate: 2.5,
        trendGdpGrowth: 2.5,
      },
      "1991": {
        targetInflation: 12,
        neutralPrimeRate: 20,
        trendGdpGrowth: -5,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1991": {
        manufacturing: 20,
        energy: 12,
        extraction: 10,
        defense: 10,
        agriculture: 12,
        chemical_industries: 8,
        construction: 7,
        manufacturing_vehicles: 5,
        logistics: 4,
        healthcare: 4,
        retail: 3,
        technology: 2,
        real_estate: 1,
      },
    },
  },
  strategicSectors,
  tax: {
    treasuryPsRate,
  },
  payoutCapPerTurn: 1500000,
  sovereignCorpLegalStructure: "generic_corp" as LegalStructureId,
  m2ToGdp1953: 0.42,
  gdpDenomination1953: RU_GDP_DENOMINATION_1953,
};
