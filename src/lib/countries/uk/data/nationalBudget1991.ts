import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const UK_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "UK",
  countryId: "UK",
  fiscalYear: 1991,
  population: 57_500_000,
  gdp: 600_000_000_000,
  currencyCode: "GBP",
  economicFactors: {
    gdpGrowth: -1.0, // 1991 UK recession (Major)
    wageGrowth: 5.0,
    inflationRate: 5.9,
    tradeGrowth: 0.0,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.5517,
    corporateProfits: 0.1655,
    wagesAndSalaries: 0.5345,
    importValue: 0.1552,
    taxableSales: 0.3293,
  },
  otherRevenue: 35_000_000_000,
  debt: {
    // Consolidated gross public-sector debt, end-March 1991, Table A.
    // Distinct from net debt (£154.467B) and market national debt (£163.448B).
    // https://www.bankofengland.co.uk/-/media/boe/files/quarterly-bulletin/1991/the-net-debt-of-the-public-sector-end-march-1991.pdf
    principal: 194_118_000_000,
    interestRate: 0.105,
    ceiling: 240_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AAA", // UK was AAA in 1991
  baselineSpendingByCategory: {
    health: 30_000_000_000,
    education: 25_000_000_000,
    statePensions: 30_000_000_000,
    welfare: 50_000_000_000,
    defense: 24_000_000_000,
    transport: 7_000_000_000,
    localGovernment: 15_000_000_000,
    other: 64_000_000_000,
  },
  baselineStateGrants: 18_000_000_000,
  policyRevenueConfigs: [
    {
      legislationTypeId: "uk_nhs_funding",
      revenueKey: "healthcareIncome",
      annualRevenuePerCapitaByOptionIndex: [500, 400, 300, 200, 120, 60, 30],
    },
  ],
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.uk.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.uk.optionIndexes,
  taxPolicyIds: {
    incomeTax: "uk_income_tax_rate",
    domesticCorporateTax: "uk_domestic_corporation_tax",
    foreignCorporateTax: "uk_foreign_corporation_tax",
    payrollTax: "uk_national_insurance",
    tariffs: "uk_excise_customs",
    salesTax: "uk_vat",
  },
};
