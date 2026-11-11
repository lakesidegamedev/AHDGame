import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const JP_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "JP",
  countryId: "JP",
  fiscalYear: 1991,
  population: 124_000_000,
  gdp: 470_000_000_000_000, // ~470 trillion JPY nominal
  currencyCode: "JPY",
  economicFactors: {
    gdpGrowth: 3.4, // bubble peak just past
    wageGrowth: 4.0,
    inflationRate: 3.3,
    tradeGrowth: 2.0,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.4,
    corporateProfits: 0.12,
    wagesAndSalaries: 0.42,
    importValue: 0.14,
    taxableSales: 0.38,
  },
  otherRevenue: 8_000_000_000_000,
  debt: {
    // Government general bonds outstanding, end-FY1991, rounded trillions.
    // The previous ¥167T was FY1990. This excludes local-government debt.
    // https://www.mof.go.jp/english/policy/budget/budget/fy2025/01.pdf
    principal: 172_000_000_000_000,
    interestRate: 0.058,
    ceiling: 195_000_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AAA", // Japan was AAA pre-1998
  baselineSpendingByCategory: {
    health: 18_000_000_000_000,
    education: 6_000_000_000_000,
    statePensions: 20_000_000_000_000,
    welfare: 14_000_000_000_000,
    defense: 4_300_000_000_000,
    publicWorks: 9_000_000_000_000,
    other: 28_000_000_000_000,
  },
  baselineStateGrants: 14_000_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.jp.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.jp.optionIndexes,
  taxPolicyIds: {
    incomeTax: "jp_income_tax_rate",
    domesticCorporateTax: "jp_domestic_corporation_tax",
    payrollTax: "jp_social_insurance",
    salesTax: "jp_consumption_tax",
  },
};
