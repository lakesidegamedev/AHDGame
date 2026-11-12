import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1979 } from "@/lib/seeds/reference/basePolicies1979";

export const US_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 1979,
  population: 225_000_000,
  gdp: 2_632_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: 1.5, // 1979 real growth decelerating hard into the 1980 recession
    wageGrowth: 8.0, // high NOMINAL wage growth, but real wages falling under inflation
    inflationRate: 11.3, // 1979 CPI — the stagflation peak
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.283, // income knob index 6 (30%) × 0.283 ≈ 8.5% of GDP individual income tax
    corporateProfits: 0.072, // corporate knob index 9 (36%) × 0.072 ≈ 2.6% of GDP
    wagesAndSalaries: 0.45, // payroll knob index 4 (≈12%) × 0.45 ≈ 5.4% of GDP social insurance
    importValue: 0.1, // smaller pre-globalization trade share
    taxableSales: 0.5,
  },
  otherRevenue: 80_000_000_000, // excise + misc receipts (FY1979)
  debt: {
    principal: 829_000_000_000, // gross federal debt end-FY1979
    // 1979 Treasury rates well above every later era (10-yr ≈ 9%, bills ≈ 10%).
    interestRate: 0.095,
    // Debt ceiling raised to $879B in September 1979.
    ceiling: 879_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    healthcare: 42_000_000_000, // Medicare ≈ $29B + federal Medicaid ≈ $13B
    defense: 116_000_000_000, // FY1979 (the post-Vietnam low, just before the buildup)
    socialSecurity: 102_000_000_000, // OASDI outlays
    education: 13_000_000_000,
    infrastructure: 18_000_000_000,
    other: 213_000_000_000,
  },
  baselineStateGrants: 82_000_000_000, // federal grants-in-aid near their pre-Reagan peak
  policyDefaults: COUNTRY_POLICY_CONFIGS_1979.us.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1979.us.optionIndexes,
  taxPolicyIds: {
    incomeTax: "us_federal_income_tax_rate",
    domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
    foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
    payrollTax: "us_federal_payroll_tax_rate",
    tariffs: "us_federal_tariff_rate",
    salesTax: "us_federal_sales_tax_rate",
  },
};
