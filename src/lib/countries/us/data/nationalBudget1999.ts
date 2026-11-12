import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1999 } from "@/lib/seeds/reference/basePolicies1999";

export const US_NATIONAL_BUDGET_1999: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 1999,
  population: 279_000_000,
  gdp: 9_660_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: 4.8,
    wageGrowth: 4.5,
    inflationRate: 2.2,
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.3537,
    corporateProfits: 0.0796,
    wagesAndSalaries: 0.3148,
    importValue: 0.1852,
    taxableSales: 0.5556,
  },
  otherRevenue: 100_000_000_000,
  debt: {
    principal: 5_600_000_000_000,
    // Late-1990s Treasury rates well above the 2019/2023 era.
    interestRate: 0.062,
    // Debt ceiling set to $5.95T in 1997 (it was not raised again until 2002,
    // as the surplus paid down debt held by the public).
    ceiling: 5_950_000_000_000,
    ceilingLastRaisedYear: 1997,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    healthcare: 313_000_000_000, // Medicare ≈ $205B + federal Medicaid ≈ $108B
    defense: 275_000_000_000, // post-Cold-War "peace dividend" low
    socialSecurity: 390_000_000_000,
    education: 60_000_000_000,
    infrastructure: 50_000_000_000,
    other: 612_000_000_000,
  },
  baselineStateGrants: 285_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1999.us.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1999.us.optionIndexes,
  taxPolicyIds: {
    incomeTax: "us_federal_income_tax_rate",
    domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
    foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
    payrollTax: "us_federal_payroll_tax_rate",
    tariffs: "us_federal_tariff_rate",
    salesTax: "us_federal_sales_tax_rate",
  },
};
