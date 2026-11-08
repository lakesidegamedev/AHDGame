import type { CostScaleAnchor } from "@/lib/budget/costs";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { LegalStructureId } from "@/lib/constants/legalStructures";
import type { CurrencyCode, MonetaryBaseline } from "@/lib/constants/currencies";
import type { EraMonetaryBaseline } from "@/lib/constants/monetaryEra";
import type { LegislationType } from "@/lib/db/types";
import type { CountryEconomy } from "../contract";

/**
 * Japan's economy and fiscal constants.
 * Balance surface: changes require an issue and scripts/sim/ report; these values must match the snapshot.
 * Exchange rates are relational and deliberately not here.
 */

/** JPY. The rates that convert it are relational and stay put. */
const currencyCode: CurrencyCode = "JPY";

const nationalPolicyStateId = "jp_national";

/** The scope key used by country-scoped legislation. */
const legislationScope: NonNullable<LegislationType["countryScope"]> = "jp";

const baselineMonetary: MonetaryBaseline = {
  targetInflation: 1,
  neutralPrimeRate: 1,
};

/**
 * ⚠️ FOUR era tables, not three. The plan writes them as
 * MONETARY_BASELINES_1953/1971/1979/1991, and that slash shorthand hides four
 * separate module-private consts -- it is why D1's export count was 34 and not
 * the 32 the plan stated.
 *
 * ERA_TABLES dispatches across these by year and has no country axis of its own,
 * so it does not move.
 */
const monetaryByEra: Record<string, EraMonetaryBaseline> = {
  "1953": {
    targetInflation: 2,
    neutralPrimeRate: 5.5,
  },
  "1971": {
    targetInflation: 6.5,
    neutralPrimeRate: 7,
    trendGdpGrowth: 4.5,
  },
  "1979": {
    targetInflation: 4,
    neutralPrimeRate: 6,
  },
  "1991": {
    targetInflation: 2.5,
    // Affordable reset borrowing remains the neutral NPC-policy anchor.
    neutralPrimeRate: 3,
  },
};

/** Sector weights by era. 1979 is the manufacturing peak; 1991 the bubble. */
const sectorWeightsBase: Partial<Record<OperatingSectorType, number>> = {
  manufacturing_vehicles: 13,
  manufacturing: 12,
  technology: 11,
  real_estate: 10,
  financial: 9,
  retail: 7,
  healthcare: 6,
  construction: 6,
  chemical_industries: 5,
  telecommunications: 4,
  logistics: 4,
  media_entertainment: 3,
  media: 3,
  energy: 2,
  defense: 2,
  agriculture: 2,
  extraction: 1,
};
const sectorWeights1979: Partial<Record<OperatingSectorType, number>> = {
  manufacturing: 30,
  manufacturing_vehicles: 12,
  technology: 5,
  chemical_industries: 6,
  energy: 5,
  retail: 6,
  real_estate: 5,
  construction: 6,
  agriculture: 4,
  defense: 1,
  healthcare: 3,
  logistics: 5,
  financial: 3,
  telecommunications: 2,
  extraction: 1,
  media: 2,
  media_entertainment: 4,
};
const sectorWeights1991: Partial<Record<OperatingSectorType, number>> = {
  manufacturing: 18,
  manufacturing_vehicles: 12,
  real_estate: 9,
  financial: 12,
  construction: 9,
  technology: 8,
  retail: 7,
  chemical_industries: 5,
  healthcare: 5,
  telecommunications: 3,
  logistics: 4,
  media_entertainment: 2,
  media: 2,
  energy: 2,
  defense: 1,
  agriculture: 2,
  extraction: 1,
};

const strategicSectors: OperatingSectorType[] = ["technology", "manufacturing_vehicles"];

/** GDP and population anchors used to scale legislation costs. Balance surface. */
const repEcon = {
  gdp: 550000000000000,
  population: 126000000,
};

/** Cost-scale interpolation anchors. Balance surface. */
const costScaleAnchors: CostScaleAnchor = {
  gdpLow: 470000000000000,
  popLow: 124000000,
  scaleLow: 1,
  gdpHigh: 550000000000000,
  popHigh: 126000000,
  scaleHigh: 1.09,
};

const economicBaseline = {
  gdpGrowth: 1,
  tradeGrowth: 0,
};

/** Party-treasury public-support rates, national and state. */
const treasuryPsRate: { national: number; state: number } = {
  national: 5000000,
  state: 2500000,
};

/*
 * ⚠️ DECLARED ABOVE THE OBJECT, NOT BELOW IT. `JP_ECONOMY` now references
 * this, and a `const` referenced before its declaration throws
 * `ReferenceError` at module load -- which typecheck does not catch here
 * because the reference is legal TypeScript; only running it fails.
 */
/**
 * Denomination of Japan's 1953 GDP figures: "usd" means the authored series are
 * already USD, so the seeder must not convert at the JPY rate. Flipping this to
 * "local" would multiply 1953 GDP by roughly the yen rate. Applies to 1953 only.
 */
export const JP_GDP_DENOMINATION_1953 = "usd";

export const JP_ECONOMY: CountryEconomy = {
  currencyCode,
  nationalPolicyStateId,
  legislationScope,
  economicBaseline,
  monetary: {
    baseline: baselineMonetary,
    byEra: monetaryByEra,
  },
  sectorWeights: {
    base: sectorWeightsBase,
    byEra: {
      "1979": sectorWeights1979,
      "1991": sectorWeights1991,
    },
  },
  strategicSectors,
  repEcon,
  costScaleAnchors,
  tax: {
    /** The consumption tax. */
    neutralFederalSalesTax: 10,
    /** Japan levies no state-level sales tax. */
    neutralStateSalesTax: 0,
    treasuryPsRate,
  },
  payoutCapPerTurn: 10000000,
  sovereignCorpLegalStructure: "jp_kk" as LegalStructureId,
  m2ToGdp1953: 0.45,
  gdpDenomination1953: JP_GDP_DENOMINATION_1953,
};

/**
 * Index-fund product names offered on the Japanese exchange.
 *
 * Forwarded from `src/lib/indexFunds/fundDefinitions.ts`.
 */
export const JP_INDEX_FUND_NAMES: Record<number, string> = {
  25: "Nikkei 25 Index",
  50: "Nikkei 50 Index",
};

/**
 * Liquid capital an NPP needs before it will buy into an index fund.
 *
 * Forwarded from `src/lib/indexFunds/nppInvesting.ts`.
 *
 * ⚠ DENOMINATED IN YEN, LIKE EVERY OTHER ENTRY IN THAT TABLE. The values are
 * LOCAL currency, not anchor units, so Japan's 34,000 is not comparable to the
 * US 80,000 -- it is roughly two orders of magnitude smaller in real terms. Do
 * not "correct" it toward its neighbours.
 */
export const JP_NPP_INVESTING_MINIMUM = 34000;

/** Which budget field carries central-to-region transfers. */
export const JP_REGIONAL_GRANT_FIELD = "nationalGrant";

/**
 * Median-income band used to score the household-income metric.
 *
 * IN YEN: values are ~3 orders of magnitude above the US entry because the
 * scorer reads each country's band against its own local-currency income.
 */
export const JP_MEDIAN_INCOME_BAND = { best: 5_500_000, worst: 2_000_000 };

/** Seed sector specialisation for Japanese regions with no authored override. */
export const JP_SECTOR_SPECIALIZATION = {
  primary: "manufacturing_vehicles",
  secondary: "technology",
} as const;

/**
 * Central-government grant multiplier applied to regional budgets at seed.
 *
 * Forwarded from `src/lib/seeds/reference/budgets.ts`.
 */
export const JP_GRANT_MULTIPLIER = 0.018;

/** Budget categories Japan overrides beyond the shared defaults. */
export const JP_EXTRA_OVERRIDE_CATEGORIES = ["infrastructure", "social"] as const;

/**
 * Zeros are real rates, not missing values: Japanese prefectures levy no regional
 * income or sales tax, so filling them in adds a second tax. Foreign mirrors
 * domestic at seed by design; legislators may diverge them later.
 */
export const JP_DEFAULT_REGIONAL_TAX_RATES = {
  incomeTax: 0,
  salesTax: 0,
  domesticCorporateTax: 1.5,
  foreignCorporateTax: 1.5,
  propertyTax: 1.4,
};
