import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_2023 } from "@/lib/seeds/reference/basePolicies2023";

export const US_NATIONAL_BUDGET_2023: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 2023,
  population: 334_900_000,
  gdp: 27_400_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: 2.5,
    wageGrowth: 4.3,
    inflationRate: 4.1,
    tradeGrowth: 1.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.3537,
    corporateProfits: 0.0796,
    wagesAndSalaries: 0.3148,
    importValue: 0.1852,
    taxableSales: 0.5556,
  },
  otherRevenue: 220_000_000_000,
  debt: {
    principal: 33_200_000_000_000,
    interestRate: 0.028,
    // FY2023 debt ceiling suspended by the Fiscal Responsibility Act (June 2023);
    // set above principal so the seed never reads as already in breach.
    ceiling: 33_400_000_000_000,
    ceilingLastRaisedYear: 2023,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    healthcare: 1_700_000_000_000,
    defense: 800_000_000_000,
    socialSecurity: 1_350_000_000_000,
    education: 270_000_000_000,
    infrastructure: 150_000_000_000,
    other: 1_300_000_000_000,
  },
  baselineStateGrants: 1_100_000_000_000,
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
