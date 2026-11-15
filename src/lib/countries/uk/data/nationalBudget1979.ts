import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── United Kingdom FY1979 — Thatcher's first budget / oil shock ─────────────
// GDP ≈ £245B; Thatcher's June 1979 budget: VAT doubled 8%→15%, income tax top
// rate cut 83%→60% (basic 33%→30%); inflation 13.4%; entering the 1980 recession.
export const UK_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "UK",
  countryId: "UK",
  fiscalYear: 1979,
  population: 56_200_000,
  gdp: 245_000_000_000,
  currencyCode: "GBP",
  economicFactors: {
    gdpGrowth: -2.2, // start of the Thatcher recession
    wageGrowth: 15.0, // high nominal wages (13.4% CPI)
    inflationRate: 13.4,
    tradeGrowth: 1.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.45,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.48,
    importValue: 0.28,
    taxableSales: 0.45, // VAT doubled to 15%
  },
  otherRevenue: 12_000_000_000,
  debt: {
    principal: 87_000_000_000, // ~44% GDP
    interestRate: 0.14, // Thatcher tight-money — PSBR squeeze
    ceiling: 100_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    healthcare: 12_000_000_000, // NHS
    defense: 9_500_000_000, // NATO commitment (rising toward 3% GDP target)
    socialSecurity: 20_000_000_000, // unemployment rising + pensions
    education: 9_000_000_000,
    infrastructure: 5_000_000_000,
    other: 20_000_000_000,
  },
  baselineStateGrants: 15_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.uk.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.uk.optionIndexes,
  taxPolicyIds: {
    incomeTax: "uk_income_tax_rate",
    domesticCorporateTax: "uk_domestic_corporation_tax",
    foreignCorporateTax: "uk_foreign_corporation_tax",
    payrollTax: "uk_national_insurance",
    tariffs: "uk_excise_customs",
    salesTax: "uk_vat",
  },
};
