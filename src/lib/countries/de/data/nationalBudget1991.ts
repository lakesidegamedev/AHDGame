import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const DE_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "DE",
  countryId: "DE",
  fiscalYear: 1991,
  population: 80_000_000, // post-reunification
  gdp: 1_600_000_000_000, // ~1.6 trillion DM nominal (treated as EUR-equivalent for game)
  currencyCode: "EUR",
  economicFactors: {
    gdpGrowth: 5.1, // reunification boom in West; East collapse
    wageGrowth: 5.0,
    inflationRate: 3.5,
    tradeGrowth: 2.5,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.48,
    corporateProfits: 0.11,
    wagesAndSalaries: 0.5,
    importValue: 0.22,
    taxableSales: 0.4,
  },
  otherRevenue: 60_000_000_000,
  debt: {
    principal: 600_000_000_000,
    interestRate: 0.085,
    ceiling: 750_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    health: 80_000_000_000,
    education: 50_000_000_000,
    socialSecurity: 110_000_000_000,
    defense: 32_000_000_000,
    infrastructure: 40_000_000_000,
    reunificationTransfers: 75_000_000_000,
    other: 80_000_000_000,
  },
  baselineStateGrants: 60_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.de.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.de.optionIndexes,
  taxPolicyIds: {
    incomeTax: "de_income_tax_rate",
    domesticCorporateTax: "de_domestic_corporate_tax_rate",
    foreignCorporateTax: "de_foreign_corporate_tax_rate",
    payrollTax: "de_payroll_social_insurance",
    tariffs: "de_customs_tariff_rate",
    salesTax: "de_vat_rate",
    solidaritySurcharge: "de_solidarity_surcharge",
  },
};
