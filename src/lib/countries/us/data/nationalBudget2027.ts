import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_2023 } from "@/lib/seeds/reference/basePolicies2023";

export const US_NATIONAL_BUDGET_2027: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 2027,
  population: 341_784_857,
  gdp: 32_800_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: 2.0,
    wageGrowth: 3.6,
    inflationRate: 2.4,
    tradeGrowth: 1.8,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.3537,
    corporateProfits: 0.0796,
    wagesAndSalaries: 0.3148,
    importValue: 0.1852,
    taxableSales: 0.5556,
  },
  otherRevenue: 300_000_000_000,
  debt: {
    principal: 39_000_000_000_000,
    interestRate: 0.034,
    ceiling: 41_000_000_000_000,
    ceilingLastRaisedYear: 2027,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    healthcare: 2_100_000_000_000,
    defense: 980_000_000_000,
    socialSecurity: 1_650_000_000_000,
    education: 290_000_000_000,
    infrastructure: 190_000_000_000,
    other: 1_700_000_000_000,
  },
  baselineStateGrants: 1_300_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_2023.us.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_2023.us.optionIndexes,
  taxPolicyIds: {
    incomeTax: "us_federal_income_tax_rate",
    domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
    foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
    payrollTax: "us_federal_payroll_tax_rate",
    tariffs: "us_federal_tariff_rate",
    salesTax: "us_federal_sales_tax_rate",
  },
};
