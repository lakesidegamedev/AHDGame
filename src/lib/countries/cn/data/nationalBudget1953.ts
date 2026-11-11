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
  // The opening program spending China's old law types priced, kept when
  // China joined the law book so the 1953 opening keeps the same envelope.
  // Defense, capital construction (the first Five-Year Plan's opening year)
  // and health were pinned to authored figures then and still are.
  baselineSpendingByCategory: {
    defense: 4_880_000_000, // large PLA; Korean War just ending
    infrastructure: 3_000_000_000,
    health: 810_000_000,
    education: 677_526_261,
    socialSecurity: 1_030_987_427,
    publicSafety: 346_023_606,
    agriculture: 482_378_865,
    other: 552_504_426,
  },
  baselineStateGrants: 0,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.cn.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.cn.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.CN,
  taxPolicyIds: {},
};
