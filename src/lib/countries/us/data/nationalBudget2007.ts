import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_2007 } from "@/lib/seeds/reference/basePolicies2007";

export const US_NATIONAL_BUDGET_2007: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 2007,
  population: 301_200_000,
  gdp: 14_450_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: 1.9,
    wageGrowth: 4.0,
    inflationRate: 2.9,
    tradeGrowth: 2.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.3537,
    corporateProfits: 0.0796,
    wagesAndSalaries: 0.3148,
    importValue: 0.1852,
    taxableSales: 0.5556,
  },
  otherRevenue: 150_000_000_000,
  debt: {
    principal: 9_000_000_000_000,
    // 2007 Treasury rates materially higher than the 2019/2023 era.
    interestRate: 0.048,
    // Debt ceiling raised to $9.815T in Sept 2007.
    ceiling: 9_815_000_000_000,
    ceilingLastRaisedYear: 2007,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    healthcare: 630_000_000_000, // Medicare ≈ $440B + federal Medicaid ≈ $190B
    defense: 550_000_000_000, // base + Iraq/Afghanistan supplementals
    socialSecurity: 586_000_000_000,
    education: 90_000_000_000,
    infrastructure: 70_000_000_000,
    other: 800_000_000_000,
  },
  baselineStateGrants: 430_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_2007.us.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_2007.us.optionIndexes,
  taxPolicyIds: {
    incomeTax: "us_federal_income_tax_rate",
    domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
    foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
    payrollTax: "us_federal_payroll_tax_rate",
    tariffs: "us_federal_tariff_rate",
    salesTax: "us_federal_sales_tax_rate",
  },
};
