import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── China FY1953 — People's Republic / First Five-Year Plan ─────────────────
// GDP ≈ $33.3B USD-equivalent (¥CNY 82B at official ~2.46 CNY/USD
// USD-anchor). Korean War armistice July 1953; 1st FYP started 1953 with Soviet
// technical aid; mass land reform completed; PLA huge. Amounts are USD-anchored
// (like US/DE); currencyCode CNY is display-only.
export const CN_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "CN",
  countryId: "CN",
  fiscalYear: 1953,
  population: 588_000_000,
  gdp: 33_300_000_000, // ≈ $33.3B (¥CNY 82B / 2.46)
  currencyCode: "CNY",
  economicFactors: {
    gdpGrowth: 15.0, // Soviet-assisted industrialisation + land reform gains
    wageGrowth: 8.0,
    inflationRate: 3.5,
    tradeGrowth: 15.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.02, // virtually no individual income tax yet
    corporateProfits: 0.04,
    wagesAndSalaries: 0.4,
    importValue: 0.1,
    taxableSales: 0.45,
  },
  otherRevenue: 2_030_000_000, // was ¥5B → ~$2.03B
  debt: {
    principal: 3_250_000_000, // Soviet loans (interest-bearing)
    interestRate: 0.03,
    ceiling: 8_130_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BB",
  baselineSpendingByCategory: {
    defense: 4_880_000_000, // large PLA; Korean War just ending
    education: 1_630_000_000, // mass literacy campaign
    // 1st-FYP capital construction ramped over 1953-57 toward its ¥76.4B
    // five-year total; 1953 (the plan's first year, still standing up
    // Soviet-aided project sites) sits at the low end of that ramp, not the
    // plan's later peak run-rate — cut from 7.32B (22% of GDP, the full-plan
    // average share) to 9% of GDP, in line with commonly-cited PRC
    // national-budget capital-construction shares for the plan's opening
    // year (fiscal audit F-11; the original 22% figure produced a 57%-of-GDP
    // total budget once this category was correctly pinned instead of
    // silently discarded — see EXTRA_OVERRIDE_CATEGORIES_BY_COUNTRY.CN).
    infrastructure: 3_000_000_000,
    socialSecurity: 810_000_000,
    // Key is "health" (not "healthcare") — matches cn_medical_insurance /
    // cn_elder_care / cn_public_health / cn_mental_health's actual
    // legislationType.budgetCategory. The old "healthcare" key never
    // matched, so this line fell back to the (much thinner) raw era-catalog
    // sum inside deriveEnactedLaws' override rescale (fiscal audit F-11).
    health: 810_000_000,
    other: 2_030_000_000,
  },
  baselineStateGrants: 1_630_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.cn.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.cn.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.CN,
  taxPolicyIds: {},
};
