import type { CountryEconomy } from "../contract";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";

/**
 * BLR's money.
 *
 * Generated from `__snapshots__/blr.pre-move.json`, not transcribed. Regenerate:
 *
 *     npx tsx scripts/countries/gen-country-economy.ts BLR --force
 *
 * The exchange rate is deliberately not here: currency identity is this
 * country's fact, but a rate is a fact about a pair in a year and belongs
 * beside the rates it must stay consistent with.
 *
 * Every figure is in local currency; do not reconcile toward other countries.
 *
 * No monetary baseline for 1971, 1979, 1991 and no sector weights for 1953,
 * 1979: BLR has no entry in those tables and takes the base baseline. The key
 * is ABSENT rather than defaulted, because inventing one would turn a fallback
 * into an authored value.
 */

const currencyCode = "SUR" as CurrencyCode;
const nationalPolicyStateId = "blr_national";
const legislationScope = "blr";
// No ECONOMIC_BASELINES row; the folder omits `economicBaseline` rather than defaulting it.
const baselineMonetary = {
  targetInflation: 2,
  neutralPrimeRate: 3,
};
const sectorWeightsBase = {
  manufacturing: 24,
  agriculture: 16,
  chemical_industries: 10,
  energy: 8,
  construction: 7,
  manufacturing_vehicles: 6,
  retail: 5,
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
const BLR_GDP_DENOMINATION_1953 = "local";

export const BLR_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  monetary: {
    baseline: baselineMonetary,
    byEra: {
      "1953": {
        targetInflation: 0.5,
        neutralPrimeRate: 2.5,
        trendGdpGrowth: 5,
      },
    },
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1991": {
        manufacturing: 24,
        agriculture: 16,
        chemical_industries: 10,
        energy: 8,
        construction: 7,
        manufacturing_vehicles: 6,
        retail: 5,
      },
    },
  },
  strategicSectors,
  tax: {
    treasuryPsRate,
  },
  sovereignCorpLegalStructure: "generic_corp" as LegalStructureId,
  gdpDenomination1953: BLR_GDP_DENOMINATION_1953,
};
