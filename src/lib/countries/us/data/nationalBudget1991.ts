import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const US_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 1991,
  population: 252_177_000,
  gdp: 6_200_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: -0.1, // 1991 recession
    wageGrowth: 3.5,
    inflationRate: 4.2,
    tradeGrowth: 0.5,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.3537,
    corporateProfits: 0.0796,
    wagesAndSalaries: 0.3148,
    importValue: 0.1852,
    taxableSales: 0.5556,
  },
  otherRevenue: 45_000_000_000,
  debt: {
    // FY1991 Treasury public debt securities, rounded to billions. Includes
    // intragovernmental holdings; excludes separate agency securities.
    // https://www.fiscal.treasury.gov/files/reports-statements/treasury-bulletin/b16.pdf (FD-1)
    principal: 3_665_000_000_000,
    interestRate: 0.075,
    ceiling: 4_145_000_000_000,
    ceilingLastRaisedYear: 1990,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    healthcare: 195_000_000_000,
    defense: 320_000_000_000,
    socialSecurity: 270_000_000_000,
    education: 45_000_000_000,
    infrastructure: 35_000_000_000,
    other: 210_000_000_000,
  },
  baselineStateGrants: 154_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.us.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.us.optionIndexes,
  taxPolicyIds: {
    incomeTax: "us_federal_income_tax_rate",
    domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
    foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
    payrollTax: "us_federal_payroll_tax_rate",
    tariffs: "us_federal_tariff_rate",
    salesTax: "us_federal_sales_tax_rate",
  },
};
